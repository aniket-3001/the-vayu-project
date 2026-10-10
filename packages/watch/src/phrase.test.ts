import { describe, expect, it, vi } from 'vitest';
import { numbersIn, numbersMatchFacts, phrase, type Generate } from './phrase';

const FACTS = { aqi: 410, stage: 'IV', startsAt: '6:00', hoursAhead: 12.5 };
const TEMPLATE = 'GRAP Stage IV likely: AQI 410. Starts at 6:00.';

describe('numbersIn', () => {
  it('finds integers, decimals, times and thousands separators', () => {
    expect(numbersIn('AQI 410, 12.5 hours, at 6:00, 1,200 people')).toEqual([
      410, 12.5, 6, 0, 1200,
    ]);
    expect(numbersIn('no digits here')).toEqual([]);
  });
});

describe('numbersMatchFacts (rule I6)', () => {
  it('accepts text whose numbers all appear in the facts', () => {
    expect(numbersMatchFacts('Stage IV is likely, AQI 410, from 6:00.', FACTS)).toBe(true);
    expect(numbersMatchFacts('About 12.5 hours away.', FACTS)).toBe(true);
    expect(numbersMatchFacts('Nothing numeric.', FACTS)).toBe(true);
  });
  it('does not mistake the pollutant names PM2.5 and PM10 for numbers', () => {
    expect(numbersIn('PM2.5 is 62; PM10 is 120; pm 2.5 again')).toEqual([62, 120]);
    expect(numbersMatchFacts('PM2.5 is 62 today.', { pm25: 62 })).toBe(true);
    expect(numbersMatchFacts('PM2.5 is 63 today.', { pm25: 62 })).toBe(false);
  });
  it('rejects a number that is not in the facts', () => {
    expect(numbersMatchFacts('AQI 450 expected.', FACTS)).toBe(false);
    expect(numbersMatchFacts('Within 2 hours.', FACTS)).toBe(false);
  });
});

describe('phrase', () => {
  it('uses the model wording when every number matches', async () => {
    const generate: Generate = () =>
      Promise.resolve('Heads up: Stage IV looks likely, with AQI at 410. It starts at 6:00.');
    const result = await phrase({ template: TEMPLATE, facts: FACTS, generate });
    expect(result.source).toBe('model');
    expect(result.text).toMatch(/^Heads up/);
  });

  it('forces the plain template when the model invents a number', async () => {
    const generate: Generate = () => Promise.resolve('Stage IV is likely with AQI 450 from 6:00.');
    const result = await phrase({ template: TEMPLATE, facts: FACTS, generate });
    expect(result).toEqual({ text: TEMPLATE, source: 'template', reason: 'number_not_in_facts' });
  });

  it('falls back when the model errors, returns nothing, or hangs past the timeout', async () => {
    const boom: Generate = () => Promise.reject(new Error('AccessDenied'));
    expect(await phrase({ template: TEMPLATE, facts: FACTS, generate: boom })).toEqual({
      text: TEMPLATE,
      source: 'template',
      reason: 'model_unavailable',
    });
    const empty: Generate = () => Promise.resolve('   ');
    expect((await phrase({ template: TEMPLATE, facts: FACTS, generate: empty })).reason).toBe(
      'empty_response',
    );

    vi.useFakeTimers();
    const hang: Generate = () => new Promise<string>(() => undefined);
    const pending = phrase({ template: TEMPLATE, facts: FACTS, generate: hang, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    expect((await pending).reason).toBe('model_unavailable');
    vi.useRealTimers();
  });

  it('shows the model the template and the facts, and tells it not to add numbers', async () => {
    const generate = vi.fn<Generate>().mockResolvedValue('ok');
    await phrase({ template: TEMPLATE, facts: FACTS, generate });
    const prompt = generate.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain(TEMPLATE);
    expect(prompt).toContain('"aqi":410');
    expect(prompt).toMatch(/do not (add|introduce|invent).*number/i);
  });
});

describe('bedrockGenerator', () => {
  it('sends a Converse call to the APAC Nova Micro profile and returns the text', async () => {
    const { bedrockGenerator } = await import('./phrase');
    const send = vi
      .fn()
      .mockResolvedValue({ output: { message: { content: [{ text: 'hello' }] } } });
    const generate = bedrockGenerator({ client: { send } as never });
    expect(await generate('prompt')).toBe('hello');
    const [command] = send.mock.calls[0] as [{ input: { modelId: string; messages: unknown[] } }];
    expect(command.input.modelId).toBe('apac.amazon.nova-micro-v1:0');
    expect(command.input.messages).toHaveLength(1);
  });

  it('returns an empty string when the response has no text', async () => {
    const { bedrockGenerator } = await import('./phrase');
    const generate = bedrockGenerator({ client: { send: vi.fn().mockResolvedValue({}) } as never });
    expect(await generate('p')).toBe('');
  });
});
