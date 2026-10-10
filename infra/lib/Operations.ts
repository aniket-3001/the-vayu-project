import { Duration } from 'aws-cdk-lib';
import type { HttpApi, HttpStage } from 'aws-cdk-lib/aws-apigatewayv2';
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  Metric,
  TreatMissingData,
  type IAlarm,
  type IMetric,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import type { IStateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface OperationsProps {
  readonly apiFunction: IFunction;
  readonly harvestFunction: IFunction;
  readonly stationsFunction: IFunction;
  readonly ingestFunction: IFunction;
  readonly sendFunction: IFunction;
  readonly alertLoop: IStateMachine;
  readonly httpApi: HttpApi;
  readonly httpStage: HttpStage;
  /** Where alarms go. Without it the alarms exist and show in the console, but nobody is mailed. */
  readonly alertEmail?: string | undefined;
}

/**
 * Seeing that it works, and hearing when it does not: one alarm per thing that can quietly stop
 * (the API, the harvest, the ingest, the send step, the alert loop), a dashboard, and one topic
 * the alarms mail. A harvest that stops running is an alarm of its own, because a Lambda that never
 * runs never reports an error.
 */
export class Operations extends Construct {
  readonly topic: Topic;
  readonly alarms: readonly IAlarm[];

  constructor(scope: Construct, id: string, props: OperationsProps) {
    super(scope, id);

    this.topic = new Topic(this, 'AlarmTopic', { displayName: 'Vayu alarms' });
    if (props.alertEmail !== undefined) {
      this.topic.addSubscription(new EmailSubscription(props.alertEmail));
    }

    const errors = (fn: IFunction, period: Duration): IMetric =>
      fn.metricErrors({ period, statistic: 'Sum' });
    const alarm = (
      name: string,
      description: string,
      metric: IMetric,
      threshold: number,
      options: {
        readonly operator?: ComparisonOperator;
        readonly missing?: TreatMissingData;
      } = {},
    ): Alarm => {
      const created = new Alarm(this, name, {
        alarmDescription: description,
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator:
          options.operator ?? ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: options.missing ?? TreatMissingData.NOT_BREACHING,
      });
      created.addAlarmAction(new SnsAction(this.topic));
      return created;
    };

    const fiveMinutes = Duration.minutes(5);
    const apiGateway = (metricName: string): Metric =>
      new Metric({
        namespace: 'AWS/ApiGateway',
        metricName,
        dimensionsMap: { ApiId: props.httpApi.apiId, Stage: props.httpStage.stageName },
        period: fiveMinutes,
        statistic: 'Sum',
      });

    this.alarms = [
      alarm(
        'ApiErrors',
        'The API Lambda is failing (5 or more errors in 5 minutes).',
        errors(props.apiFunction, fiveMinutes),
        5,
      ),
      alarm('Api5xx', 'The public API is answering with server errors.', apiGateway('5xx'), 5),
      alarm(
        'HarvestErrors',
        'The harvest run failed.',
        errors(props.harvestFunction, Duration.minutes(15)),
        1,
      ),
      // A schedule that stops, or a Lambda that cannot start, produces no errors at all: no runs is the signal.
      alarm(
        'HarvestStopped',
        'The harvest has not run for 45 minutes (it should run every 15).',
        props.harvestFunction.metricInvocations({ period: Duration.minutes(45), statistic: 'Sum' }),
        1,
        {
          operator: ComparisonOperator.LESS_THAN_THRESHOLD,
          missing: TreatMissingData.BREACHING,
        },
      ),
      alarm(
        'StationsStopped',
        'The map monitors have not been snapshotted for 90 minutes (they should be every 30).',
        props.stationsFunction.metricInvocations({
          period: Duration.minutes(90),
          statistic: 'Sum',
        }),
        1,
        {
          operator: ComparisonOperator.LESS_THAN_THRESHOLD,
          missing: TreatMissingData.BREACHING,
        },
      ),
      alarm(
        'IngestErrors',
        'The device ingest failed on a message.',
        errors(props.ingestFunction, fiveMinutes),
        1,
      ),
      alarm('SendErrors', 'An alert send failed.', errors(props.sendFunction, fiveMinutes), 1),
      alarm(
        'AlertLoopFailed',
        'An alert loop run failed.',
        props.alertLoop.metricFailed({ period: fiveMinutes, statistic: 'Sum' }),
        1,
      ),
    ];

    const dashboard = new Dashboard(this, 'Dashboard', { dashboardName: 'Vayu' });
    const graph = (title: string, left: IMetric[], right: IMetric[] = []): GraphWidget =>
      new GraphWidget({ title, left, right, width: 8, height: 6 });
    dashboard.addWidgets(
      graph('API requests and errors', [apiGateway('Count'), apiGateway('5xx'), apiGateway('4xx')]),
      graph(
        'API Lambda',
        [props.apiFunction.metricInvocations(), props.apiFunction.metricErrors()],
        [props.apiFunction.metricDuration({ statistic: 'p95' })],
      ),
      graph('Harvest runs and errors', [
        props.harvestFunction.metricInvocations({ period: Duration.minutes(15) }),
        props.harvestFunction.metricErrors({ period: Duration.minutes(15) }),
      ]),
      graph('Device ingest', [
        props.ingestFunction.metricInvocations(),
        props.ingestFunction.metricErrors(),
      ]),
      graph('Alert sends', [
        props.sendFunction.metricInvocations(),
        props.sendFunction.metricErrors(),
      ]),
      graph('Alert loop runs', [
        props.alertLoop.metricStarted(),
        props.alertLoop.metricSucceeded(),
        props.alertLoop.metricFailed(),
      ]),
    );
  }
}
