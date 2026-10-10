/**
 * Demo trigger for the AlertLoop on AWS. Run it yourself, with the project's AWS profile:
 *
 *   AWS_PROFILE=vayu npx tsx packages/watch/src/watchDemo.cli.ts link-code school-demo principal
 *   AWS_PROFILE=vayu npx tsx packages/watch/src/watchDemo.cli.ts start school-demo          (dry run)
 *   AWS_PROFILE=vayu npx tsx packages/watch/src/watchDemo.cli.ts start school-demo --go
 *
 *   AWS_PROFILE=vayu npx tsx packages/watch/src/watchDemo.cli.ts voice-sample voice-sample.mp3
 *
 * `voice-sample` asks Polly for the Hindi voice note of the demo alert and saves it to a file. It
 * sends nothing to anyone. `start` shows who is linked and whether the kill switch is on, and only starts a run with
 * `--go`. It never turns the kill switch on: that is a separate, deliberate command.
 */
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { ListStateMachinesCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { writeFileSync } from 'node:fs';
import { toIso } from '@vayu/core';
import { buildExecutionInput } from './executionInput';
import { fixtureAlert } from './fixtures';
import { dynamoLinkStore } from './dynamoLinkStore';
import { hindiVoiceText } from './hindi';
import { generateLinkCode } from './linking';
import { loadPolicy } from './policy';
import { pollyHindiVoice } from './polly';

const out = (line: string): void => {
  process.stdout.write(`${line}
`);
};
const fail = (line: unknown): void => {
  process.stderr.write(`${typeof line === 'string' ? line : String(line)}
`);
};

const KILL_SWITCH = '/vayu/watch/sends-enabled';
const LINK_CODE_MINUTES = 30;

async function findWatchTable(): Promise<string> {
  const result = await new DynamoDBClient({}).send(new ListTablesCommand({}));
  const name = result.TableNames?.find((table) => table.includes('Watch'));
  if (name === undefined) throw new Error('Could not find the Watch table in this account');
  return name;
}

async function linkCode(group: string, role: string): Promise<void> {
  const store = dynamoLinkStore({ tableName: await findWatchTable() });
  const code = generateLinkCode();
  const expiresAt = toIso(Date.now() + LINK_CODE_MINUTES * 60_000);
  await store.saveLinkCode({ code, groupId: group, role, expiresAt });
  out(`Send this to @vayulabs_watch_bot within ${LINK_CODE_MINUTES} minutes:\n\n  /link ${code}\n`);
  out(`It links that chat as "${role}" in group "${group}".`);
}

async function start(group: string, go: boolean): Promise<void> {
  const policy = loadPolicy('policy_school_grap');
  const firstRole = policy.steps[0]?.to;
  if (firstRole === undefined) throw new Error('The policy has no steps');

  const alert = fixtureAlert({
    id: `demo-${Date.now()}`,
    ruleId: 'rule-grap-early-warning',
    audience: { groupId: group, role: firstRole },
    title: 'GRAP Stage IV likely tomorrow',
    body: 'Forecast AQI crosses the official Stage IV threshold. Consider keeping tomorrow indoor.',
    facts: { aqi: 410 },
    mode: 'replay',
    unofficial: true,
  });
  const input = buildExecutionInput(policy, alert);

  const store = dynamoLinkStore({ tableName: await findWatchTable() });
  const linked = await store.linksForRole(group, firstRole);
  const switchValue = await new SSMClient({})
    .send(new GetParameterCommand({ Name: KILL_SWITCH }))
    .then((result) => result.Parameter?.Value ?? 'unset');

  out(`Group: ${group}   first recipient role: ${firstRole}   linked chats: ${linked.length}`);
  out(`Kill switch (${KILL_SWITCH}): ${switchValue}`);
  out(`Waits (seconds): ${input.steps.map((step) => step.waitSeconds).join(', ')}`);

  if (!go) {
    out('\nDry run. Add --go to start a run.');
    return;
  }
  if (linked.length === 0)
    throw new Error(`Nobody is linked as ${firstRole} in ${group}; run link-code first`);

  const sfn = new SFNClient({});
  const machines = await sfn.send(new ListStateMachinesCommand({}));
  const machine = machines.stateMachines?.find((candidate) =>
    candidate.name?.startsWith('AlertLoop'),
  );
  if (machine?.stateMachineArn === undefined)
    throw new Error('Could not find the AlertLoop state machine');

  const started = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: machine.stateMachineArn,
      name: alert.id,
      input: JSON.stringify(input),
    }),
  );
  out(`\nStarted: ${started.executionArn ?? '(no arn)'}`);
  if (switchValue !== 'true')
    out('The kill switch is not "true", so the run will stop without sending.');
}

/** The Hindi voice note for the demo alert, as a local MP3. Nothing is sent to anyone. */
async function voiceSample(file: string): Promise<void> {
  const alert = fixtureAlert({
    ruleId: 'rule-grap-early-warning',
    facts: { aqi: 410 },
    unofficial: true,
  });
  const text = hindiVoiceText(alert);
  if (text === undefined) throw new Error('There is no Hindi wording for this alert');
  out(text);
  const audio = await pollyHindiVoice()(text);
  writeFileSync(file, audio);
  out(`\nSaved ${String(audio.length)} bytes to ${file}`);
}

async function main(): Promise<void> {
  const [command, group, ...rest] = process.argv.slice(2);
  if (command === 'link-code' && group !== undefined && rest[0] !== undefined) {
    await linkCode(group, rest[0]);
  } else if (command === 'voice-sample') {
    await voiceSample(group ?? 'voice-sample.mp3');
  } else if (command === 'start' && group !== undefined) {
    await start(group, rest.includes('--go'));
  } else {
    out('Usage:\n  link-code <group> <role>\n  start <group> [--go]\n  voice-sample [file.mp3]');
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
