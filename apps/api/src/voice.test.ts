import { fixtureAlert } from '@vayu/watch';
import { describe, expect, it } from 'vitest';
import { voiceFromSetting } from './voice';

const alert = fixtureAlert({ ruleId: 'rule-grap-early-warning', facts: { aqi: 410 } });
const speak = (text: string): Promise<Uint8Array> =>
  Promise.resolve(new TextEncoder().encode(text));

describe('voiceFromSetting', () => {
  it('is off unless the setting is exactly "on", so a deploy cannot start talking by accident', () => {
    for (const setting of [undefined, '', 'off', 'ON', 'true', 'yes']) {
      expect(voiceFromSetting(setting, speak)).toBeUndefined();
    }
  });

  it('when on, speaks the Hindi wording for the alert, with the step it is', async () => {
    const voice = voiceFromSetting('on', speak);
    const audio = await voice?.(alert, 'remind');
    const text = new TextDecoder().decode(audio);
    expect(text).toMatch(/^अनुस्मारक/);
    expect(text).toContain('410');
  });

  it('says nothing for an alert it has no Hindi wording for', async () => {
    const voice = voiceFromSetting('on', speak);
    expect(await voice?.(fixtureAlert({ ruleId: 'rule-unknown' }))).toBeUndefined();
  });
});
