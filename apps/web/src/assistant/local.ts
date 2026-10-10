import { answerFromRules } from '@vayu/core';
import type { Answer, AssistantSource } from './types';

/** The rules alone, with no model and no network. What answers when the assistant cannot be reached. */
export const localAssistant: AssistantSource = {
  ask(question, context): Promise<Answer> {
    const { text } = answerFromRules(question, context);
    return Promise.resolve({ text, basis: context.basis });
  },
};
