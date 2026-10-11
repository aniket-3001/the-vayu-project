import { answerFromRules } from '@vayu/core';
import type { Answer, AssistantSource } from './types';

/** The rules alone, with no model and no network. What answers when the assistant cannot be reached. */
export const localAssistant: AssistantSource = {
  ask(question, context, lang = 'en'): Promise<Answer> {
    const { text } = answerFromRules(question, context, lang);
    return Promise.resolve({ text, basis: context.basis });
  },
};
