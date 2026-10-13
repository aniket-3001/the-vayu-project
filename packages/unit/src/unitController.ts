import type { UnitLink, UnitTransport } from './ble';
import { recordReading } from './measured';
import { isReading, parsePacket, type UnitReading } from './unitProtocol';

export type UnitStatus = 'idle' | 'connecting' | 'connected' | 'lost' | 'failed';

export interface UnitState {
  readonly status: UnitStatus;
  /** The name the unit advertises. */
  readonly name?: string;
  /** The app's device id the readings are kept under. */
  readonly deviceId?: string;
  readonly latest?: { readonly reading: UnitReading; readonly atMs: number };
  /** The last reading taken while the unit sat on the purifier. Never part of `latest` or `recent`: it is not the room. */
  readonly purified?: { readonly reading: UnitReading; readonly atMs: number };
  /** True while the unit's latest reading was taken on the purifier. */
  readonly onPurifier: boolean;
  /** The last few minutes of PM2.5, for the live chart. */
  readonly recent: readonly { readonly atMs: number; readonly pm25: number }[];
  /** Words for the person when it could not connect or a packet was refused. */
  readonly problem?: string;
}

/** About fifteen minutes at one reading every two seconds. */
export const RECENT_KEEP = 450;

const PROBLEMS: Readonly<Record<string, string>> = {
  too_short: 'The unit sent something too short to be a reading.',
  wrong_version: 'The unit speaks a different version. Update the unit’s firmware or the app.',
  no_particle_reading: 'The unit’s sensor has no reading yet.',
  out_of_range: 'The unit sent a number no real air could give, so it was not used.',
};

/**
 * The one live link to a measuring unit, held outside any screen so it stays connected while the person moves between
 * tabs, and so a card on My Air and the Devices tab show the same reading. Each good reading is added to the hour it
 * falls in, under the device the person set up, so Exposure can count the hours spent there. A reading taken while
 * the sensor is still warming up is shown but never kept.
 */
export class UnitController {
  private state: UnitState = { status: 'idle', recent: [], onPurifier: false };
  private readonly listeners = new Set<() => void>();
  private link: UnitLink | undefined;
  private deviceId: string | undefined;
  /** Bumped on each connect and disconnect, so a late packet from an old link is ignored. */
  private session = 0;

  constructor(
    private readonly options: {
      readonly storage?: () => Storage;
      readonly now?: () => number;
    } = {},
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = (): UnitState => this.state;

  private set(next: UnitState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /** Back to nothing connected and nothing remembered, for a test. */
  reset = (): void => {
    this.session += 1;
    this.link?.disconnect();
    this.link = undefined;
    this.deviceId = undefined;
    this.set({ status: 'idle', recent: [], onPurifier: false });
  };

  disconnect = (): void => {
    this.session += 1;
    this.link?.disconnect();
    this.link = undefined;
    this.set({ ...this.state, status: 'idle' });
  };

  /** `named` is told the unit's name once it is found, and gives back the device id to keep its readings under. */
  connect = async (transport: UnitTransport, named: (bleName: string) => string): Promise<void> => {
    this.link?.disconnect();
    this.link = undefined;
    const session = ++this.session;
    const now = this.options.now ?? Date.now;
    this.set({ status: 'connecting', recent: [], onPurifier: false });
    try {
      const opened = await transport.connect({
        onPacket: (bytes) => {
          if (session !== this.session) return;
          const parsed = parsePacket(bytes);
          if (!isReading(parsed)) {
            this.set({ ...this.state, problem: PROBLEMS[parsed] ?? 'A reading was refused.' });
            return;
          }
          const atMs = now();
          if (parsed.context === 'purifier') {
            // The air at the purifier's output is not the room's: kept apart, never charted or counted in the hours.
            this.set({
              ...this.state,
              status: 'connected',
              onPurifier: true,
              purified: { reading: parsed, atMs },
            });
            return;
          }
          if (!parsed.warming && this.deviceId !== undefined) {
            const storage = this.options.storage?.() ?? window.localStorage;
            recordReading(storage, this.deviceId, atMs, parsed.pm25);
          }
          const s = this.state;
          this.set({
            ...(s.name === undefined ? {} : { name: s.name }),
            ...(s.deviceId === undefined ? {} : { deviceId: s.deviceId }),
            ...(s.purified === undefined ? {} : { purified: s.purified }),
            status: 'connected',
            onPurifier: false,
            latest: { reading: parsed, atMs },
            recent: parsed.warming
              ? s.recent
              : [...s.recent, { atMs, pm25: parsed.pm25 }].slice(-RECENT_KEEP),
          });
        },
        onDisconnect: () => {
          if (session !== this.session) return;
          this.link = undefined;
          this.set({ ...this.state, status: this.state.status === 'idle' ? 'idle' : 'lost' });
        },
      });
      if (session !== this.session) {
        opened.disconnect();
        return;
      }
      this.link = opened;
      this.deviceId = named(opened.name);
      this.set({
        ...this.state,
        name: opened.name,
        deviceId: this.deviceId,
      });
    } catch (error) {
      if (session !== this.session) return;
      const declined =
        error instanceof Error &&
        /cancel|chosen|denied|NotFound/iu.test(error.name + error.message);
      this.set({
        status: declined ? 'idle' : 'failed',
        recent: [],
        onPurifier: false,
        ...(declined
          ? {}
          : {
              problem: error instanceof Error ? error.message : 'The unit could not be connected.',
            }),
      });
    }
  };
}

/** The unit the app is connected to, for every screen. */
export const sharedUnit = new UnitController();
