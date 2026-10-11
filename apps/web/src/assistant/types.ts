import type { AssistantContext } from '@vayu/contracts';
import type { Lang } from './lang';

export type { AssistantContext };

export interface Answer {
  readonly text: string;
  /** Where the answer came from, in a few words, for the small print. */
  readonly basis: string;
  /** An audio file of the answer, when the voice service gave one (Amazon Polly). */
  readonly audioUrl?: string;
}

/** Whoever answers: the local rules when offline, Amazon Bedrock behind our API when online. The screen does not care which. */
export interface AssistantSource {
  ask(question: string, context: AssistantContext, lang?: Lang): Promise<Answer>;
}
