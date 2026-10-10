import { z } from 'zod';

/**
 * Contracts shared by every block. Each schema is the single source of truth for a type:
 * `z.infer` gives the compile-time type, `.parse` validates at a boundary. Everything is
 * readonly, so values are copied rather than changed in place.
 */

const record = <Shape extends z.ZodRawShape>(shape: Shape): z.ZodReadonly<z.ZodObject<Shape>> =>
  z.object(shape).readonly();
const list = <Item extends z.ZodTypeAny>(item: Item): z.ZodReadonly<z.ZodArray<Item>> =>
  z.array(item).readonly();

/** What kind of value the viewer is looking at. Never mix these without a label (rule I12). */
export const Mode = z.enum(['live', 'replay', 'model', 'measured']);
export type Mode = z.infer<typeof Mode>;

/** The six CPCB air-quality bands, from best to worst. */
export const Band = z.enum(['good', 'satisfactory', 'moderate', 'poor', 'very_poor', 'severe']);
export type Band = z.infer<typeof Band>;

export const TrustLabel = z.enum(['Estimate', 'Nearby station', 'Your room']);
export type TrustLabel = z.infer<typeof TrustLabel>;

export const ProvenanceSource = z.enum(['station', 'forecast', 'pattern', 'unit', 'model', 'test']);
export type ProvenanceSource = z.infer<typeof ProvenanceSource>;

/** Where a number came from and how old it is. Every displayed number carries one (rule I2). */
export const Provenance = record({
  mode: Mode,
  label: TrustLabel,
  source: ProvenanceSource,
  stationId: z.string().optional(),
  stationName: z.string().optional(),
  distanceKm: z.number().optional(),
  observedAt: z.string().optional(),
  fetchedAt: z.string(),
  asOf: z.string(),
  ageMinutes: z.number(),
  simulated: z.boolean().optional(),
});
export type Provenance = z.infer<typeof Provenance>;

export const PlaceKind = z.enum(['home', 'school', 'office', 'park', 'other']);
export const Place = record({
  id: z.string(),
  name: z.string(),
  kind: PlaceKind,
  lat: z.number(),
  lng: z.number(),
});
export type Place = z.infer<typeof Place>;

export const ReadingFlag = z.enum(['damp', 'out_of_range', 'stale', 'duplicate', 'simulated']);

/** One sensor reading from a station or from the module. */
export const Reading = record({
  schemaVersion: z.literal(1),
  id: z.string(),
  thingId: z.string().optional(),
  stationId: z.string().optional(),
  ts: z.string(),
  pm1: z.number().optional(),
  pm25: z.number().nullable(),
  pm4: z.number().optional(),
  pm10: z.number().nullable(),
  tempC: z.number().optional(),
  rhPct: z.number().optional(),
  flags: list(ReadingFlag),
  simulated: z.boolean(),
});
export type Reading = z.infer<typeof Reading>;

/**
 * One hourly value. `hourStart` is the start of the hour the value covers; it can be used only
 * once the hour has ended. `null` means "we do not know", never zero.
 */
export const RawHour = record({
  hourStart: z.string(),
  pm25: z.number().nullable(),
  pm10: z.number().nullable(),
});
export type RawHour = z.infer<typeof RawHour>;

export const HourKind = z.enum(['observed', 'forecast', 'pattern']);
export type HourKind = z.infer<typeof HourKind>;

export const HourPoint = record({
  hourStart: z.string(),
  pm25: z.number().nullable(),
  pm10: z.number().nullable(),
  band: Band.nullable(),
  kind: HourKind,
  prov: Provenance,
});
export type HourPoint = z.infer<typeof HourPoint>;

export const WindowKind = z.enum(['walk', 'play', 'airing', 'assembly']);
export type WindowKind = z.infer<typeof WindowKind>;

export const Window = record({
  kind: WindowKind,
  start: z.string(),
  end: z.string(),
  meanPm25: z.number(),
  band: Band,
  comparison: record({ versus: z.string(), lessPct: z.number() }).optional(),
  rationale: list(z.string()),
});
export type Window = z.infer<typeof Window>;

export const DaySummary = record({
  date: z.string(),
  minPm25: z.number(),
  maxPm25: z.number(),
  worstBand: Band,
});
export type DaySummary = z.infer<typeof DaySummary>;

/** The weather model's value for one hour. A model forecast, never a measurement. */
export const WeatherNow = record({
  /** Start of the hour it covers. */
  at: z.string(),
  windKmh: z.number().nonnegative(),
  /** The direction the wind comes FROM, in degrees (0 is north). */
  windFromDeg: z.number().min(0).max(360),
  rhPct: z.number().min(0).max(100),
  tempC: z.number(),
});
export type WeatherNow = z.infer<typeof WeatherNow>;

export const Timeline = record({
  schemaVersion: z.literal(1),
  place: Place,
  asOf: z.string(),
  mode: Mode,
  hours: list(HourPoint),
  week: list(DaySummary),
  windows: list(Window),
  headline: z.string(),
  prov: Provenance,
  /** Present when the weather model answered; its absence never blocks the air answer. */
  weather: WeatherNow.optional(),
});
export type Timeline = z.infer<typeof Timeline>;

/** One hour of the air at a place, in the compact form the app draws from. */
export const TodayHour = record({
  t: z.string(),
  pm25: z.number().nullable(),
  kind: HourKind,
});
export type TodayHour = z.infer<typeof TodayHour>;

/** The weather model's hour. A model for the area, never a measurement at the place. */
export const WeatherHour = record({
  t: z.string(),
  tempC: z.number(),
  rhPct: z.number(),
  windKmh: z.number().nonnegative(),
  windFromDeg: z.number(),
  rainPct: z.number(),
  rainMm: z.number(),
  /** WMO weather code. */
  code: z.number().int(),
  isDay: z.boolean(),
  uv: z.number(),
});
export type WeatherHour = z.infer<typeof WeatherHour>;

export const WeatherDay = record({
  /** Midnight at the start of the day, India time, ISO. */
  date: z.string(),
  tMaxC: z.number(),
  tMinC: z.number(),
  windKmh: z.number(),
  windFromDeg: z.number(),
  rhPct: z.number(),
  rainPct: z.number(),
  code: z.number().int(),
  sunrise: z.string(),
  sunset: z.string(),
});
export type WeatherDay = z.infer<typeof WeatherDay>;

/** The gases from the regional air-quality model, for the hour. Modelled, never measured here. */
export const Gases = record({
  at: z.string(),
  pm10: z.number().nullable(),
  o3: z.number().nullable(),
  no2: z.number().nullable(),
  so2: z.number().nullable(),
  co: z.number().nullable(),
});
export type Gases = z.infer<typeof Gases>;

/**
 * `/v1/today`: everything the Today screen needs for one place, in one cached answer. The hours are PM2.5 only;
 * the app turns them into the US AQI with the shared `usAqi`, so the number on screen and in an alert agree.
 */
export const Today = record({
  schemaVersion: z.literal(1),
  place: Place,
  asOf: z.string(),
  mode: Mode,
  /** Past observed hours, then the forecast, oldest first. */
  hours: list(TodayHour),
  weather: record({ hours: list(WeatherHour), days: list(WeatherDay) }).optional(),
  gases: Gases.optional(),
  windows: list(Window),
  headline: z.string(),
  prov: Provenance,
});
export type Today = z.infer<typeof Today>;

/** `/v1/history`: the hourly PM2.5 a place's nearest monitor gave over the last days, or the regional model if none is recent. */
export const History = record({
  schemaVersion: z.literal(1),
  place: Place,
  asOf: z.string(),
  mode: Mode,
  days: z.number().int(),
  hours: list(record({ t: z.string(), pm25: z.number().nullable() })),
  prov: Provenance,
});
export type History = z.infer<typeof History>;

/** One monitor's latest PM2.5 for the map. */
export const MapStation = record({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  pm25: z.number(),
  /** When the reading applies. */
  at: z.string(),
});
export type MapStation = z.infer<typeof MapStation>;

/** `/v1/stations`: the monitors with a recent reading, for the map. */
export const Stations = record({
  schemaVersion: z.literal(1),
  asOf: z.string(),
  mode: Mode,
  source: z.string(),
  stations: list(MapStation),
});
export type Stations = z.infer<typeof Stations>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const MOBILE = /^(?:\+?91[\s-]?)?[6-9]\d{9}$/u;

/**
 * What someone sends to ask for a demo or for monitors: who they are, where, and how to reach them. Only what is
 * needed to get back to them. `POST /v1/requests` takes exactly this and refuses anything else.
 */
export const AccessRequest = z
  .object({
    who: z.enum(['school', 'society', 'person']),
    name: z.string().trim().min(1).max(80),
    organisation: z.string().trim().max(120),
    area: z.string().trim().min(1).max(120),
    contact: z
      .string()
      .trim()
      .max(120)
      .refine((value) => EMAIL.test(value) || MOBILE.test(value.replaceAll(/[\s-]/gu, '')), {
        message: 'Give an email address or a 10-digit mobile number',
      }),
    wants: z
      .array(z.enum(['demo', 'monitors']))
      .min(1)
      .max(2),
    places: z.string().regex(/^\d{0,4}$/u),
    sentAt: z.string().optional(),
  })
  .strict()
  .refine((r) => r.who === 'person' || r.organisation.length > 0, {
    message: 'A school or a society needs its name',
    path: ['organisation'],
  });
export type AccessRequest = z.infer<typeof AccessRequest>;

/**
 * A report that a fire is burning somewhere: where, and what the person wants to add. It is kept so a person can
 * check it, and it is not sent to any agency. `POST /v1/fire-reports` takes exactly this and refuses anything else.
 */
export const FireReport = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    /** For a fire seen on the map: how long ago the satellite saw it. */
    hoursAgo: z.number().int().min(0).max(240).optional(),
    /** For a fire seen on the map: how fierce it was, in megawatts. */
    frp: z.number().min(0).max(5000).optional(),
    note: z.string().trim().max(200).optional(),
    sentAt: z.string().optional(),
  })
  .strict();
export type FireReport = z.infer<typeof FireReport>;

/**
 * What the assistant is allowed to know when it is asked: one place's air and day, the alerts, and who is
 * being tracked. Every field is bounded, and nothing else is accepted: the assistant never sees anything the
 * person has not chosen to give it.
 */
export const AssistantContext = z
  .object({
    place: z.string().trim().min(1).max(60),
    aqi: z.number().int().min(0).max(500),
    level: z.string().max(40),
    pm25: z.number().min(0).max(1000),
    /** The cleanest daylight hour ahead, if any. */
    best: z
      .object({ span: z.string().max(40), aqi: z.number().int().min(0).max(500) })
      .strict()
      .optional(),
    /** GRAP stage by our estimate, 0 for none. */
    grapStage: z.number().int().min(0).max(4),
    alerts: z.array(z.string().max(80)).max(8),
    fires: z.number().int().min(0).max(100_000).optional(),
    people: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(40),
            age: z.number().int().min(0).max(110),
            day: z.enum(['school', 'work', 'none']),
          })
          .strict(),
      )
      .max(6),
    /** Where the numbers came from, in words, so every answer can say. */
    basis: z.string().max(200),
  })
  .strict();
export type AssistantContext = z.infer<typeof AssistantContext>;

export const AssistantRequest = z
  .object({ question: z.string().trim().min(1).max(300), context: AssistantContext })
  .strict();
export type AssistantRequest = z.infer<typeof AssistantRequest>;

/** How an answer was worded: from fixed rules, reworded by the model and checked, or by the model from the facts. */
export const AssistantSource = z.enum(['rules', 'model_reworded', 'model_grounded']);
export const AssistantReply = z.object({
  text: z.string(),
  /** Where the answer came from, in a few words, for the small print. */
  basis: z.string(),
  source: AssistantSource,
});
export type AssistantReply = z.infer<typeof AssistantReply>;

/**
 * `POST /v1/speech`: an answer to be read aloud. The text is at most 400 characters; the voice is a woman's, Amazon
 * Polly's Kajal. The audio comes back as MP3, in base64.
 */
export const SpeechRequest = z.object({ text: z.string().trim().min(1).max(400) }).strict();
export type SpeechRequest = z.infer<typeof SpeechRequest>;
export const SpeechReply = z.object({
  audio: z.string().min(1),
  voice: z.literal('Kajal'),
  characters: z.number().int().min(1).max(400),
  /** True when the same words had been spoken lately and the audio was kept. */
  cached: z.boolean(),
});
export type SpeechReply = z.infer<typeof SpeechReply>;

export const Leakiness = z.enum(['closed', 'typical', 'windows_open', 'custom']);
export const RoomSpec = record({
  id: z.string(),
  name: z.string(),
  lengthM: z.number().positive(),
  widthM: z.number().positive(),
  heightM: z.number().positive(),
  airChangesPerHour: z.number().nonnegative(),
  leakiness: Leakiness,
  volumeM3: z.number().positive(),
});
export type RoomSpec = z.infer<typeof RoomSpec>;

export const CleanerSpec = record({
  id: z.string(),
  name: z.string(),
  layers: list(z.enum(['foam', 'merv13', 'h13'])),
  cadrM3h: record({ pm25: z.number().nonnegative(), pm10: z.number().nonnegative() }),
  noiseDbA: z.number().optional(),
  powerW: z.number().optional(),
  basis: z.enum(['measured', 'datasheet', 'assumed']),
});
export type CleanerSpec = z.infer<typeof CleanerSpec>;

export const SimEvent = record({
  at: z.string(),
  kind: z.enum(['smoke', 'dust', 'cooking']),
  pm25: z.number().optional(),
  pm10: z.number().optional(),
});
export type SimEvent = z.infer<typeof SimEvent>;

export const SimInput = record({
  room: RoomSpec,
  cleaners: list(record({ spec: CleanerSpec, count: z.number().int().nonnegative() })),
  outdoor: list(RawHour),
  events: list(SimEvent),
  startAt: z.string(),
  durationHours: z.number().positive(),
  stepMinutes: z.number().positive().optional(),
  targetAch: z.number().positive().optional(),
});
export type SimInput = z.infer<typeof SimInput>;

export const SimPoint = record({ ts: z.string(), pm25: z.number(), pm10: z.number() });
export type SimPoint = z.infer<typeof SimPoint>;

export const Assumption = record({
  name: z.string(),
  value: z.union([z.number(), z.string()]),
  basis: z.enum(['measured', 'datasheet', 'assumed']),
});
export type Assumption = z.infer<typeof Assumption>;

export const SimResult = record({
  schemaVersion: z.literal(1),
  series: list(SimPoint),
  baseline: list(SimPoint),
  summary: record({
    halvingMinutes: z.number(),
    steadyPm25: z.number(),
    steadyPm25NoCleaner: z.number(),
    lowerPct: z.number(),
    bandBefore: Band,
    bandAfter: Band,
    changesPerHour: z.number(),
    unitsNeeded: z.number(),
  }),
  assumptions: list(Assumption),
});
export type SimResult = z.infer<typeof SimResult>;

export const Verdict = z.enum(['working_well', 'helping_a_bit', 'not_working', 'not_sure']);
export type Verdict = z.infer<typeof Verdict>;

export const Reason = z.enum([
  'too_clean_to_judge',
  'damp_air',
  'stale_inside',
  'stale_outside',
  'sensors_disagree',
  'offline',
  'no_outdoor_reference',
  'no_inside_reading',
]);
export type Reason = z.infer<typeof Reason>;

export const RoomVerdict = record({
  schemaVersion: z.literal(1),
  roomId: z.string(),
  asOf: z.string(),
  cleanerThanOutsidePct: z.number().nullable(),
  insidePm25: z.number().nullable(),
  outsidePm25: z.number().nullable(),
  expectedPct: z.number().optional(),
  verdict: Verdict,
  reasons: list(Reason),
  prov: Provenance,
});
export type RoomVerdict = z.infer<typeof RoomVerdict>;

export const AlertAction = z.enum(['seen', 'planned', 'done', 'im_in', 'not_today']);
export type AlertAction = z.infer<typeof AlertAction>;

export const Alert = record({
  schemaVersion: z.literal(1),
  id: z.string(),
  ruleId: z.string(),
  audience: record({ groupId: z.string(), role: z.string() }),
  title: z.string(),
  body: z.string(),
  facts: z.record(z.union([z.number(), z.string()])).readonly(),
  createdAt: z.string(),
  mode: Mode,
  unofficial: z.boolean().optional(),
  actions: list(AlertAction),
  policyId: z.string(),
});
export type Alert = z.infer<typeof Alert>;

export const Ack = record({
  alertId: z.string(),
  actor: z.string(),
  action: AlertAction,
  at: z.string(),
});
export type Ack = z.infer<typeof Ack>;

export const DecayRun = record({
  kind: z.enum(['baseline', 'on']),
  startedAt: z.string(),
  kPerHour: z.number(),
  seStderr: z.number(),
  r2: z.number(),
  samples: z.number().int(),
});
export type DecayRun = z.infer<typeof DecayRun>;

export const TestCard = record({
  schemaVersion: z.literal(1),
  id: z.string(),
  room: record({ name: z.string(), volumeM3: z.number(), volumeMethod: z.string() }),
  unit: record({ name: z.string(), layers: list(z.string()), speed: z.string() }),
  sensorPosition: z.string(),
  runs: list(DecayRun),
  cadrM3h: z.number(),
  cadrCi95: z.tuple([z.number(), z.number()]).readonly(),
  noiseDbA: z.number().optional(),
  powerW: z.number().optional(),
  tempC: z.number().optional(),
  rhPct: z.number().optional(),
  rawDataUrl: z.string(),
  method: z.string(),
  caveats: list(z.string()),
});
export type TestCard = z.infer<typeof TestCard>;

/** The hourly series one place sees in a replay week: its nearest station with data, plus a week of history. */
export const ReplayPlaceSeries = record({
  schemaVersion: z.literal(1),
  weekId: z.string(),
  placeId: z.string(),
  station: record({
    id: z.string(),
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
    distanceKm: z.number(),
  }),
  hours: list(RawHour),
});
export type ReplayPlaceSeries = z.infer<typeof ReplayPlaceSeries>;

/** A real past week prepared for replay. Events (such as GRAP orders) always carry their source. */
export const ReplayManifest = record({
  schemaVersion: z.literal(1),
  weekId: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  stationIds: list(z.string()),
  events: list(record({ date: z.string(), label: z.string(), source: z.string() })),
  note: z.string().optional(),
});
export type ReplayManifest = z.infer<typeof ReplayManifest>;

/** What the measurement module publishes every ten seconds (topic `vayu/v1/{thingId}/readings`). */
export const DeviceMessage = record({
  schemaVersion: z.literal(1),
  ts: z.string(),
  seq: z.number().int().nonnegative(),
  pm1: z.number().optional(),
  pm25: z.number().nonnegative(),
  pm4: z.number().optional(),
  pm10: z.number().nonnegative(),
  tempC: z.number().optional(),
  rhPct: z.number().min(0).max(100).optional(),
  fw: z.string().optional(),
  simulated: z.boolean().optional(),
});
export type DeviceMessage = z.infer<typeof DeviceMessage>;

/**
 * What the API knows about one room right now, before any verdict is worked out. The app turns it
 * into a verdict with the shared core, the same as for any other source.
 */
export const RoomObservation = record({
  roomId: z.string(),
  roomName: z.string(),
  asOf: z.string(),
  insidePm25: z.number().nullable(),
  insideObservedAt: z.string().nullable(),
  rhPct: z.number().nullable(),
  outsidePm25: z.number().nullable(),
  outsideObservedAt: z.string().nullable(),
  lastSeenMinutes: z.number().nullable(),
  /** True when any reading behind the numbers came from the dev publisher or a model. */
  simulated: z.boolean(),
});
export type RoomObservation = z.infer<typeof RoomObservation>;

export const FixCheckStatus = z.enum(['waiting', 'improved', 'not_improved', 'not_sure']);
export type FixCheckStatus = z.infer<typeof FixCheckStatus>;

/** The answer to "did it work?" for one room: where it started, where it is, and what that means. */
export const FixCheckResult = record({
  fixCheckId: z.string(),
  roomId: z.string(),
  startedAt: z.string(),
  status: FixCheckStatus,
  baselinePm25: z.number().nullable(),
  latestPm25: z.number().nullable(),
  /** How far the room fell since the start, in percent. Null when either end is unknown. */
  dropPct: z.number().nullable(),
  /** Looks taken so far. */
  tries: z.number().int().nonnegative(),
  /** True when it did not work and a person should be told. */
  escalate: z.boolean(),
  finishedAt: z.string().optional(),
  /** True when any reading behind the numbers was simulated. */
  simulated: z.boolean(),
});
export type FixCheckResult = z.infer<typeof FixCheckResult>;
