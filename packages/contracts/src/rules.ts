import { z } from 'zod';
import { Band } from './schemas';
import cpcbJson from '../rules/cpcb.json';
import trustJson from '../rules/trust.json';
import walkJson from '../rules/walk_window.json';
import grapJson from '../rules/grap_early_warning.json';
import verdictJson from '../rules/verdict.json';
import roomJson from '../rules/room_defaults.json';
import policyJson from '../rules/policy_school_grap.json';
import fixCheckJson from '../rules/fixcheck.json';

const BreakpointRow = z
  .object({ bpLo: z.number(), bpHi: z.number(), iLo: z.number(), iHi: z.number(), band: Band })
  .readonly();

/** An escalation policy: who gets told, in what order, with how long to wait for each step. */
export const PolicySchema = z
  .object({
    id: z.string(),
    steps: z
      .array(z.object({ action: z.string(), to: z.string(), waitMin: z.number() }).readonly())
      .readonly(),
    demoTimeScale: z.number(),
  })
  .readonly();
export type Policy = z.infer<typeof PolicySchema>;

/** Every threshold the product uses. They are hypotheses held as data, not code. */
export const RulesSchema = z
  .object({
    cpcb: z
      .object({
        minValidHours: z.number().int(),
        pm25: z.array(BreakpointRow).readonly(),
        pm10: z.array(BreakpointRow).readonly(),
      })
      .readonly(),
    trust: z
      .object({ stationMaxKm: z.number(), freshMin: z.number(), unusableMin: z.number() })
      .readonly(),
    walkWindow: z
      .object({
        minutes: z.number(),
        earliest: z.string(),
        latest: z.string(),
        /** Highest US AQI at which an hour outside is still suggested (EPA: above 150 everyone should cut back). */
        maxUsAqi: z.number(),
        /** The same for children, older adults and people with a condition (EPA: above 100 they should). */
        maxUsAqiSensitive: z.number(),
        usualStart: z.string(),
        horizonHours: z.number(),
      })
      .readonly(),
    grap: z
      .object({
        warnAqi: z.number(),
        headsUpAqi: z.number(),
        officialStageIvAqi: z.number(),
        horizonHours: z.number(),
      })
      .readonly(),
    verdict: z
      .object({
        workingWellPct: z.number(),
        redBelowPct: z.number(),
        minOutsidePm25: z.number(),
        maxRhPct: z.number(),
        maxInsideAgeMin: z.number(),
        maxOutsideAgeMin: z.number(),
        maxDisagreePct: z.number(),
        offlineAfterMin: z.number(),
      })
      .readonly(),
    room: z
      .object({
        penetration: z.number(),
        airChangesPerHour: z
          .object({
            closed: z.number(),
            typical: z.number(),
            classroom: z.number(),
            windows_open: z.number(),
          })
          .readonly(),
        deposition: z.object({ pm25: z.number(), pm10: z.number() }).readonly(),
        targetAch: z.object({ classroom: z.number(), home: z.number() }).readonly(),
        stepMinutes: z.number(),
      })
      .readonly(),
    policySchoolGrap: PolicySchema,
    /** "Did it work?": how far the room must have dropped, how many looks, and how long one wait may be. */
    fixCheck: z
      .object({
        minDropPct: z.number().positive(),
        maxTries: z.number().int().positive(),
        minWaitSeconds: z.number().positive(),
        maxWaitSeconds: z.number().positive(),
      })
      .readonly()
      .refine(
        (rule) => rule.minWaitSeconds <= rule.maxWaitSeconds,
        'minWaitSeconds exceeds maxWaitSeconds',
      ),
  })
  .readonly();
export type Rules = z.infer<typeof RulesSchema>;

/** Parsed once at start-up, so a typo in a JSON file fails loudly instead of quietly misleading. */
export const rules: Rules = RulesSchema.parse({
  cpcb: cpcbJson,
  trust: trustJson,
  walkWindow: walkJson,
  grap: grapJson,
  verdict: verdictJson,
  room: roomJson,
  policySchoolGrap: policyJson,
  fixCheck: fixCheckJson,
});
