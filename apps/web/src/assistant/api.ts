import { AssistantReply } from '@vayu/contracts';
import { localAssistant } from './local';
import type { Answer, AssistantContext, AssistantSource } from './types';

/** Why the assistant's own wording was not used, in words for the small print. */
const WHY: Readonly<Record<number, string>> = {
  503: 'the assistant is switched off just now',
  429: 'the assistant has reached its limit for now',
};

/**
 * The assistant behind our API: `POST {base}/v1/assistant` with the question and what the app already knows. The
 * API answers from fixed rules and may have Amazon Bedrock put the words kindly, checked against the facts. When it
 * cannot be reached, is switched off, or has reached its daily limit, the app answers from the same rules
 * itself, with the same numbers, and says so in the small print, so nothing stops working.
 */
export function apiAssistant(baseUrl: string, fetchImpl: typeof fetch = fetch): AssistantSource {
  const without = async (
    question: string,
    context: AssistantContext,
    why: string,
  ): Promise<Answer> => {
    const answer = await localAssistant.ask(question, context);
    return { ...answer, basis: `${answer.basis}. Answered by the app’s own rules: ${why}.` };
  };
  return {
    async ask(question: string, context: AssistantContext): Promise<Answer> {
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl.replace(/\/$/u, '')}/v1/assistant`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question, context }),
        });
      } catch {
        return without(question, context, 'the assistant could not be reached');
      }
      if (!res.ok)
        return without(question, context, WHY[res.status] ?? 'the assistant had a problem');
      try {
        const reply = AssistantReply.parse(await res.json());
        return { text: reply.text, basis: reply.basis };
      } catch {
        return without(question, context, 'the assistant sent something we could not read');
      }
    },
  };
}
