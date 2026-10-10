/**
 * FixCheck as Amazon States Language (build spec §7.6): "did it work?"
 *
 *   Baseline -> Wait -> Verify -> Looked --improved--------------------------> Record
 *                 ^                  |--no, and looks left--> Wait (again)
 *                 |                  |--no, none left-------> Record
 *   (any step that fails goes to Record, which then says "not sure")
 *
 * Input: `{ fixCheckId, roomId, placeId, waitSeconds, triesLeft, baselinePm25 }`. How long to wait
 * comes from the input (the start step has already checked it against the rules), so no wait is
 * unbounded (rule I9). The machine only owns the waiting and the looping; every decision about
 * the room lives in the tested Lambda and in `core.fixOutcome`.
 */
export function fixCheckDefinition(functionArn: string): Record<string, unknown> {
  const step = (name: 'baseline' | 'verify' | 'record'): Record<string, unknown> => ({
    Type: 'Task',
    Resource: 'arn:aws:states:::lambda:invoke',
    Parameters: { FunctionName: functionArn, Payload: { step: name, 'state.$': '$' } },
    OutputPath: '$.Payload',
    TimeoutSeconds: 30,
    Retry: [
      {
        ErrorEquals: ['Lambda.ServiceException', 'Lambda.TooManyRequestsException'],
        IntervalSeconds: 2,
        MaxAttempts: 2,
        BackoffRate: 2,
      },
    ],
  });

  return {
    Comment: 'FixCheck: look, wait, look again. Every wait comes from the input and is bounded.',
    StartAt: 'Baseline',
    TimeoutSeconds: 3600,
    States: {
      Baseline: {
        ...step('baseline'),
        Next: 'WaitToLook',
        Catch: [{ ErrorEquals: ['States.ALL'], ResultPath: '$.error', Next: 'Record' }],
      },
      WaitToLook: { Type: 'Wait', SecondsPath: '$.waitSeconds', Next: 'Verify' },
      Verify: {
        ...step('verify'),
        Next: 'Looked',
        Catch: [{ ErrorEquals: ['States.ALL'], ResultPath: '$.error', Next: 'Record' }],
      },
      Looked: {
        Type: 'Choice',
        Choices: [
          { Variable: '$.outcome', StringEquals: 'improved', Next: 'Record' },
          { Variable: '$.triesLeft', NumericGreaterThan: 0, Next: 'WaitToLook' },
        ],
        Default: 'Record',
      },
      Record: {
        ...step('record'),
        Catch: [{ ErrorEquals: ['States.ALL'], ResultPath: '$.error', Next: 'RecordFailed' }],
        End: true,
      },
      RecordFailed: {
        Type: 'Fail',
        Error: 'FixCheckRecordFailed',
        Cause: 'The answer could not be written.',
      },
    },
  };
}
