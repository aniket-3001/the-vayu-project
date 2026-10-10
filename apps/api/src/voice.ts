import type { Alert } from '@vayu/contracts';
import { hindiVoiceText, pollyHindiVoice, type Voice } from '@vayu/watch';

/**
 * Voice notes are opt-in per deployment (`VOICE=on`, exactly). Off, alerts are text only, as
 * before. On, an alert that has Hindi wording also gets a Polly voice note after its text.
 */
export function voiceFromSetting(
  setting: string | undefined,
  speak: Voice = pollyHindiVoice(),
): ((alert: Alert, action?: string) => Promise<Uint8Array | undefined>) | undefined {
  if (setting !== 'on') return undefined;
  return async (alert, action) => {
    const text = hindiVoiceText(alert, action);
    return text === undefined ? undefined : speak(text);
  };
}
