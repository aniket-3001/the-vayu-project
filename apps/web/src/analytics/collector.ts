import type { AnalyticsEvent, Band, Batch, DeviceInfo, Kind } from './types';

export interface Collector {
  /** Notes that something happened. Never throws and never waits. */
  track(kind: Kind, detail?: string, n?: number): void;
  /** Sends what is waiting. Never rejects. */
  flush(): Promise<void>;
}

export interface CollectorOptions {
  /** Delivers one batch; true means it arrived. */
  readonly send: (batch: Batch) => Promise<boolean>;
  readonly deviceId: () => string;
  readonly sessionId: string;
  readonly device: () => DeviceInfo;
  readonly now: () => string;
  /** The AQI band showing right now, if any: noted on each event, so activity can be told apart by how the air was. */
  readonly band?: () => Band | undefined;
  /** The most events kept while waiting; the oldest go first. */
  readonly maxQueue?: number;
  readonly batchSize?: number;
}

/**
 * A small queue of usage events. Anything that goes wrong is swallowed: counting how the app is used must never get
 * in the way of using it. A batch that does not get through is tried once more on the next send, then dropped, so a
 * failing network cannot make the queue grow or the app keep retrying.
 */
export function createCollector(options: CollectorOptions): Collector {
  const maxQueue = options.maxQueue ?? 200;
  const batchSize = options.batchSize ?? 25;
  let queue: { event: AnalyticsEvent; tries: number }[] = [];
  let sending = false;

  const track = (kind: Kind, detail = '', n = 1): void => {
    try {
      const band = kind === 'context' ? undefined : options.band?.();
      queue.push({
        event: { kind, detail, n, at: options.now(), ...(band === undefined ? {} : { band }) },
        tries: 0,
      });
      if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue);
    } catch {
      // Nothing to do: the event is lost, the app carries on.
    }
  };

  const flush = async (): Promise<void> => {
    if (sending) return;
    sending = true;
    try {
      while (queue.length > 0) {
        const chunk = queue.slice(0, batchSize);
        queue = queue.slice(chunk.length);
        let delivered = false;
        try {
          delivered = await options.send({
            deviceId: options.deviceId(),
            sessionId: options.sessionId,
            device: options.device(),
            events: chunk.map((item) => item.event),
          });
        } catch {
          delivered = false;
        }
        if (!delivered) {
          // One more chance on the next send; a second failure drops them.
          const again = chunk.filter((item) => item.tries === 0).map((item) => ({ ...item, tries: 1 }));
          queue = [...again, ...queue].slice(-maxQueue);
          return;
        }
      }
    } finally {
      sending = false;
    }
  };

  return { track, flush };
}
