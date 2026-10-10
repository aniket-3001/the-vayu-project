import type { Alert } from '@vayu/contracts';
import type { ChannelAdapter, SendContext } from './adapters';
import { phrase, type Generate } from './phrase';

export const MODEL_FOOTER = 'Wording by AI, checked against the facts.';
export const TEMPLATE_FOOTER = 'Plain template.';

/**
 * Wraps any channel so the alert body is reworded by the model before sending (spec §4, wording
 * only). The title, facts, recipients and timing are never touched: the model decides nothing.
 * Every message ends with a footer saying which wording the person is reading.
 */
export function phrasingAdapter(
  inner: ChannelAdapter,
  generate: Generate,
  options: { readonly timeoutMs?: number } = {},
): ChannelAdapter {
  return {
    channel: inner.channel,
    async send(alert: Alert, recipient: string, context?: SendContext): Promise<void> {
      const phrased = await phrase({
        template: alert.body,
        facts: alert.facts,
        generate,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      });
      const footer = phrased.source === 'model' ? MODEL_FOOTER : TEMPLATE_FOOTER;
      await inner.send({ ...alert, body: `${phrased.text}\n\n${footer}` }, recipient, context);
    },
  };
}
