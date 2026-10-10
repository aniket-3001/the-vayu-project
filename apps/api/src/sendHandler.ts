import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Alert } from '@vayu/contracts';
import { liveClock } from '@vayu/core';
import {
  bedrockGenerator,
  phrasingAdapter,
  type ChannelAdapter,
  type Generate,
  dynamoLinkStore,
  dynamoTokenStore,
  sendStep,
  telegramAdapter,
  type SendStepDeps,
} from '@vayu/watch';
import { Logger } from '@aws-lambda-powertools/logger';
import { z } from 'zod';
import { ssmSendsEnabled } from './sfnResume';
import { voiceFromSetting } from './voice';
import { traced } from './tracing';

const logger = new Logger({ serviceName: 'vayu-send' });

/** What the state machine passes the Send task. Anything else is refused before a send is considered. */
export const SendEvent = z.object({
  alert: Alert,
  step: z.object({ index: z.number().int().nonnegative(), action: z.string(), to: z.string() }),
  taskToken: z.string().min(1),
});

/**
 * Wording by the model is opt-in per deployment (`PHRASING=on`). Off, the plain template goes out
 * unchanged. On, every message is reworded and number-checked, and falls back to the template (and
 * says so in its footer) whenever the model is unavailable or invents a number.
 */
export function withPhrasing(
  channel: ChannelAdapter,
  setting: string | undefined,
  generate: Generate,
): ChannelAdapter {
  return setting === 'on' ? phrasingAdapter(channel, generate) : channel;
}

/** The Lambda body as a function of its dependencies, so it runs in tests with no AWS. */
export function createSendHandler(deps: SendStepDeps): (event: unknown) => Promise<void> {
  return async (event) => {
    await sendStep(deps, SendEvent.parse(event));
  };
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`Missing environment variable ${name}`);
  return value;
}

let handlerPromise: Promise<(event: unknown) => Promise<void>> | undefined;

function build(): Promise<(event: unknown) => Promise<void>> {
  handlerPromise ??= (async () => {
    const secrets = traced(new SecretsManagerClient({}));
    const secret = await secrets.send(
      new GetSecretValueCommand({ SecretId: mustEnv('TELEGRAM_BOT_TOKEN_ARN') }),
    );
    if (!secret.SecretString) throw new Error('The Telegram bot token secret is empty');

    const tableName = mustEnv('WATCH_TABLE');
    const docClient = DynamoDBDocumentClient.from(traced(new DynamoDBClient({})));
    const demoGroupIds = new Set(
      (process.env.DEMO_GROUP_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id !== ''),
    );
    const voice = voiceFromSetting(process.env.VOICE);
    const voiceOption =
      voice === undefined
        ? {}
        : {
            voice,
            onVoiceError: (error: unknown): void => {
              logger.warn('voice note failed', {
                error: error instanceof Error ? error.message : 'unknown',
              });
            },
          };
    return createSendHandler({
      adapter: withPhrasing(
        telegramAdapter({
          botToken: secret.SecretString,
          store: dynamoLinkStore({ tableName, docClient }),
          demoGroupIds,
          // A Hindi voice note after the text, only when VOICE=on. Its failure never fails the alert.
          ...voiceOption,
        }),
        process.env.PHRASING,
        bedrockGenerator({
          client: traced(new BedrockRuntimeClient({ region: 'ap-south-1' })),
          ...(process.env.PHRASING_MODEL_ID ? { modelId: process.env.PHRASING_MODEL_ID } : {}),
        }),
      ),
      tokens: dynamoTokenStore({ tableName, docClient }),
      clock: liveClock(),
      sendsEnabled: ssmSendsEnabled(traced(new SSMClient({})), mustEnv('SENDS_ENABLED_PARAM')),
    });
  })();
  return handlerPromise;
}

/** Lambda entry for the AlertLoop's Send task. */
export async function handler(event: unknown): Promise<void> {
  const run = await build();
  await run(event);
}
