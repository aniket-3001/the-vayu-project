/** The shapes sent to `/v1/events`. They mirror the API's own (`apps/api/src/analyticsModel.ts`); keep them in step. */
export type Kind =
  | 'session_start'
  | 'screen'
  | 'feature'
  | 'permission'
  | 'bluetooth'
  | 'error'
  | 'api'
  | 'active'
  | 'context';

/** The AQI bands, best to worst; the same six the API knows (`apps/api/src/analyticsModel.ts`). */
export const BANDS = ['good', 'moderate', 'sensitive', 'unhealthy', 'very_bad', 'hazardous'] as const;
export type Band = (typeof BANDS)[number];

export interface AnalyticsEvent {
  readonly kind: Kind;
  readonly detail: string;
  readonly n: number;
  readonly at: string;
  /** The AQI band of the place the person was last looking at, when one had loaded. */
  readonly band?: Band;
}

export interface DeviceInfo {
  readonly platform: 'web' | 'android' | 'ios';
  readonly appVersion: string;
  readonly os: string;
  readonly model: string;
  readonly screen: string;
  readonly lang: string;
  readonly cell?: { readonly lat: number; readonly lng: number };
}

export interface Batch {
  readonly deviceId: string;
  readonly sessionId: string;
  readonly device: DeviceInfo;
  readonly events: readonly AnalyticsEvent[];
}
