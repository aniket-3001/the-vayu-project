import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

/** Anything that turns a prompt into text. Bedrock in production, a stub in tests. */
export type Generate = (prompt: string) => Promise<string>;

export type Facts = Readonly<Record<string, number | string>>;

export type PhraseFallbackReason = 'model_unavailable' | 'empty_response' | 'number_not_in_facts';

export interface Phrased {
  readonly text: string;
  /** Which wording was used. A message built from the template says "plain template" (spec §6). */
  readonly source: 'model' | 'template';
  readonly reason?: PhraseFallbackReason;
}

const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/** The names PM2.5 and PM10 are labels, not figures, so they are not read as numbers. */
const POLLUTANT_NAME = /PM\s?(?:2\.5|10)/gi;

/** Every number written in `text`. A time like 6:00 reads as 6 and 0; "1,200" reads as 1200. */
export function numbersIn(text: string): number[] {
  return (text.replaceAll(POLLUTANT_NAME, ' ').match(NUMBER) ?? []).map((token) =>
    Number(token.replaceAll(',', '')),
  );
}

function factNumbers(facts: Facts): Set<number> {
  const found = new Set<number>();
  for (const value of Object.values(facts)) {
    for (const n of typeof value === 'number' ? [value] : numbersIn(value)) found.add(n);
  }
  return found;
}

/** Rule I6: a generated sentence cannot contain a number that is not in its facts. */
export function numbersMatchFacts(text: string, facts: Facts): boolean {
  const allowed = factNumbers(facts);
  return numbersIn(text).every((n) => allowed.has(n));
}

function promptFor(template: string, facts: Facts): string {
  return [
    'Rewrite the message below in plain, calm, friendly words for a parent or school staff member.',
    'Keep it to one or two short sentences. Keep every fact. Do not add advice or opinions.',
    'Do not add, change, round or invent any number. Use only numbers that appear in the facts.',
    'Reply with the rewritten message only.',
    '',
    `Message: ${template}`,
    `Facts: ${JSON.stringify(facts)}`,
  ].join('\n');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('timed out'));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

export interface PhraseInput {
  /** The plain wording, which is also the fallback. Its numbers must come from `facts`. */
  readonly template: string;
  readonly facts: Facts;
  readonly generate: Generate;
  readonly timeoutMs?: number;
}

/**
 * Wording only, never decisions. Asks the model to reword `template`, then checks every number in
 * the answer against `facts`; on any doubt (error, timeout, empty, a number not in the facts) the
 * plain template goes out instead and the result says why.
 */
export async function phrase(input: PhraseInput): Promise<Phrased> {
  const fallback = (reason: PhraseFallbackReason): Phrased => ({
    text: input.template,
    source: 'template',
    reason,
  });
  let generated: string;
  try {
    generated = await withTimeout(
      input.generate(promptFor(input.template, input.facts)),
      input.timeoutMs ?? 4000,
    );
  } catch {
    return fallback('model_unavailable');
  }
  const text = generated.trim();
  if (text === '') return fallback('empty_response');
  if (!numbersMatchFacts(text, input.facts)) return fallback('number_not_in_facts');
  return { text, source: 'model' };
}

export interface BedrockGeneratorOptions {
  readonly client?: BedrockRuntimeClient;
  /**
   * A cross-region inference profile: Nova Micro cannot be called by its bare model id in
   * ap-south-1 (checked 6 Oct 2026), but the APAC profile works.
   */
  readonly modelId?: string;
  readonly region?: string;
  readonly maxTokens?: number;
}

/** A `Generate` backed by Bedrock's Converse API. Low temperature: we want calm, not creative. */
export function bedrockGenerator(options: BedrockGeneratorOptions = {}): Generate {
  const client =
    options.client ?? new BedrockRuntimeClient({ region: options.region ?? 'ap-south-1' });
  const modelId = options.modelId ?? 'apac.amazon.nova-micro-v1:0';
  return async (prompt) => {
    const response = await client.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: options.maxTokens ?? 200, temperature: 0.2 },
      }),
    );
    return response.output?.message?.content?.[0]?.text ?? '';
  };
}
