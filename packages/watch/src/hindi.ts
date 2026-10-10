import type { Alert } from '@vayu/contracts';
import { numbersMatchFacts } from './phrase';

/**
 * The words of a Hindi voice note for an alert. Fixed sentences with the facts slotted in, not
 * machine translation: a voice note for an elder is only worth sending if every word is one we
 * wrote and checked. An alert with no wording here gets no voice note (and still gets its text).
 */
const PREFIX: Readonly<Record<string, string>> = {
  remind: 'अनुस्मारक। ',
  escalate: 'आगे बढ़ाई गई सूचना। ',
};

function grapEarlyWarning(alert: Alert): string | undefined {
  const aqi = alert.facts.aqi;
  if (typeof aqi !== 'number' || !Number.isFinite(aqi) || aqi < 0) return undefined;
  return (
    `कल जी आर ए पी चरण चार लागू होने की संभावना है। ` +
    `हमारे पूर्वानुमान में हवा का एक्यूआई ${String(aqi)} तक पहुँच सकता है। ` +
    `यह हमारा अपना अनुमान है, आधिकारिक आदेश नहीं। ` +
    `कृपया कल बच्चों को घर के अंदर रखने पर विचार करें।`
  );
}

const WORDING: Readonly<Record<string, (alert: Alert) => string | undefined>> = {
  'rule-grap-early-warning': grapEarlyWarning,
};

export function hindiVoiceText(alert: Alert, action?: string): string | undefined {
  const body = WORDING[alert.ruleId]?.(alert);
  if (body === undefined) return undefined;
  const replay = alert.mode === 'replay' ? 'यह रीप्ले है, असली चेतावनी नहीं। ' : '';
  const prefix = action === undefined ? 'सूचना। ' : (PREFIX[action] ?? 'सूचना। ');
  const text = `${replay}${prefix}${body}`;
  // Rule I6, kept even for fixed wording: a number that is not in the facts is never spoken.
  return numbersMatchFacts(text, alert.facts) ? text : undefined;
}
