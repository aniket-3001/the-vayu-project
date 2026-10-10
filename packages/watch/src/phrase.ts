import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

/** Anything that turns a prompt into text. Bedrock in production, a stub in tests. */
export type Generate = (prompt: string, system?: string) => Promise<string>;

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

/** A masked name or place, such as "[person 2]": its number is a position in a list, never a figure. */
const PLACEHOLDER = /\[(?:place|person \d+)\]/gu;

/** Every number written in `text`. A time like 6:00 reads as 6 and 0; "1,200" reads as 1200. */
export function numbersIn(text: string): number[] {
  const bare = text.replaceAll(POLLUTANT_NAME, ' ').replaceAll(PLACEHOLDER, ' ');
  return (bare.match(NUMBER) ?? []).map((token) => Number(token.replaceAll(',', '')));
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

const DEFAULT_INSTRUCTION = [
  'Rewrite the message below in plain, calm, friendly words for a parent or school staff member.',
  'Keep it to one or two short sentences. Keep every fact. Do not add advice or opinions.',
  'Do not add, change, round or invent any number. Use only numbers that appear in the facts.',
  'Reply with the rewritten message only.',
].join('\n');

function promptFor(template: string, facts: Facts, instruction: string): string {
  return [instruction, '', `Message: ${template}`, `Facts: ${JSON.stringify(facts)}`].join('\n');
}

const dataFor = (template: string, facts: Facts): string =>
  [`Message: ${template}`, `Facts: ${JSON.stringify(facts)}`].join('\n');

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
  /** Replaces the standing instruction in the prompt. The number check applies whatever it says. */
  readonly instruction?: string;
  /**
   * Sends the instruction as the system prompt and only the message and facts as the prompt. A guardrail's
   * prompt-attack filter reads instructions inside the prompt as an attack; the system prompt is not read that way.
   */
  readonly instructionAsSystem?: boolean;
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
    const instruction = input.instruction ?? DEFAULT_INSTRUCTION;
    generated = await withTimeout(
      input.instructionAsSystem === true
        ? input.generate(dataFor(input.template, input.facts), instruction)
        : input.generate(promptFor(input.template, input.facts, instruction)),
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
  /** Standing instructions the caller's text cannot override. Sent as the system prompt. */
  readonly system?: string;
  /** A Bedrock Guardrail applied to both the prompt and the answer. */
  readonly guardrail?: { readonly id: string; readonly version: string };
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
  return async (prompt, system) => {
    const standing = [options.system, system].filter((part) => part !== undefined).join('\n');
    const response = await client.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        ...(standing === '' ? {} : { system: [{ text: standing }] }),
        ...(options.guardrail === undefined
          ? {}
          : {
              guardrailConfig: {
                guardrailIdentifier: options.guardrail.id,
                guardrailVersion: options.guardrail.version,
              },
            }),
        inferenceConfig: { maxTokens: options.maxTokens ?? 200, temperature: 0.2 },
      }),
    );
    // A guardrail that steps in replaces the answer with its own message. That is not wording: refuse it.
    if (response.stopReason === 'guardrail_intervened') throw new Error('guardrail intervened');
    return response.output?.message?.content?.[0]?.text ?? '';
  };
}
