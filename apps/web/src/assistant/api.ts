import { localAssistant } from './local';
import type { Answer, AssistantContext, AssistantSource } from './types';

/**
 * The assistant behind our API: `POST {base}/v1/assistant` with the question and what the app knows, answered
 * by Amazon Bedrock, with an Amazon Polly audio file for the voice. That endpoint is not deployed yet, so this
 * falls back to the local answers on any failure, and the screen carries on.
 */
export function apiAssistant(baseUrl: string, fetchImpl: typeof fetch = fetch): AssistantSource {
  return {
    async ask(question: string, context: AssistantContext): Promise<Answer> {
      try {
        const res = await fetchImpl(`${baseUrl.replace(/\/$/u, '')}/v1/assistant`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question, context }),
        });
        if (!res.ok) throw new Error(`Assistant answered ${String(res.status)}`);
        const body = (await res.json()) as { text?: unknown; audioUrl?: unknown };
        if (typeof body.text !== 'string' || body.text === '')
          throw new Error('Assistant sent no text');
        return {
          text: body.text,
          basis: 'Amazon Bedrock, from live data',
          ...(typeof body.audioUrl === 'string' ? { audioUrl: body.audioUrl } : {}),
        };
      } catch {
        return localAssistant.ask(question, context);
      }
    },
  };
}
