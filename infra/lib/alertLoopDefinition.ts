/**
 * The AlertLoop as Amazon States Language (build spec §7.6).
 *
 * Input: `{ alert, steps: [{ index, action, to, waitSeconds }] }`. `waitSeconds` is each policy
 * step's wait already divided by `demoTimeScale` and at least 1 (the trigger does that). The
 * machine is a thin shell: who is next and how long to wait come from the policy, wording and the
 * safety rules live in the tested Send Lambda.
 *
 *   PickStep -> Send (waits for a tap, with a timeout) --tap--> Acked
 *                       |-- timeout or send failure --> Advance --> PickStep ... --> Exhausted
 *                       |-- kill switch off ----------> SwitchedOff (Fail)
 */
export function alertLoopDefinition(sendFunctionArn: string): Record<string, unknown> {
  return {
    Comment: 'AlertLoop: send, wait for a person, remind, escalate. Every wait has a timeout.',
    StartAt: 'Init',
    States: {
      Init: {
        Type: 'Pass',
        Parameters: {
          'alert.$': '$.alert',
          'steps.$': '$.steps',
          i: 0,
          'count.$': 'States.ArrayLength($.steps)',
        },
        Next: 'PickStep',
      },
      PickStep: {
        Type: 'Pass',
        Parameters: {
          'alert.$': '$.alert',
          'steps.$': '$.steps',
          'i.$': '$.i',
          'count.$': '$.count',
          'current.$': 'States.ArrayGetItem($.steps, $.i)',
        },
        Next: 'Send',
      },
      Send: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke.waitForTaskToken',
        Parameters: {
          FunctionName: sendFunctionArn,
          Payload: {
            'alert.$': '$.alert',
            'step.$': '$.current',
            'taskToken.$': '$$.Task.Token',
          },
        },
        TimeoutSecondsPath: '$.current.waitSeconds',
        ResultPath: '$.result',
        Next: 'Acked',
        Catch: [
          { ErrorEquals: ['SendsDisabledError'], ResultPath: '$.error', Next: 'SwitchedOff' },
          { ErrorEquals: ['States.Timeout'], ResultPath: '$.error', Next: 'Advance' },
          { ErrorEquals: ['States.ALL'], ResultPath: '$.error', Next: 'Advance' },
        ],
      },
      Advance: {
        Type: 'Pass',
        Parameters: {
          'alert.$': '$.alert',
          'steps.$': '$.steps',
          'i.$': 'States.MathAdd($.i, 1)',
          'count.$': '$.count',
        },
        Next: 'MoreSteps',
      },
      MoreSteps: {
        Type: 'Choice',
        Choices: [{ Variable: '$.i', NumericLessThanPath: '$.count', Next: 'PickStep' }],
        Default: 'Exhausted',
      },
      Acked: { Type: 'Succeed' },
      Exhausted: { Type: 'Succeed' },
      SwitchedOff: {
        Type: 'Fail',
        Error: 'SendsDisabled',
        Cause: 'The kill switch is off, so nothing was sent.',
      },
    },
  };
}
