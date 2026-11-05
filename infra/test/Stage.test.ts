import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { VayuStack } from '../lib/VayuStack';
import { stageIdent, stageName, stageOf } from '../lib/stage';
import { Construct } from 'constructs';

/** The fixed names in a template: everything an account allows only one of. */
function fixedNames(template: Template): string[] {
  const names: string[] = [];
  for (const type of [
    'AWS::SSM::Parameter',
    'AWS::IoT::TopicRule',
    'AWS::IoT::Policy',
    'AWS::CloudWatch::Dashboard',
  ]) {
    for (const resource of Object.values(template.findResources(type))) {
      const p = resource.Properties as Record<string, unknown>;
      for (const key of ['Name', 'RuleName', 'PolicyName', 'DashboardName']) {
        if (typeof p[key] === 'string') names.push(p[key]);
      }
    }
  }
  for (const type of ['AWS::CE::AnomalyMonitor', 'AWS::CE::AnomalySubscription']) {
    for (const resource of Object.values(template.findResources(type))) {
      const p = resource.Properties as Record<string, unknown>;
      for (const key of ['MonitorName', 'SubscriptionName']) {
        if (typeof p[key] === 'string') names.push(p[key]);
      }
    }
  }
  return names;
}

const synthWith = (id: string, props: ConstructorParameters<typeof VayuStack>[2]): Template =>
  Template.fromStack(
    new VayuStack(new App(), id, { includeSite: false, alertEmail: 'a@b.in', ...props }),
  );

describe('a staging copy of the stack', () => {
  const production = synthWith('Vayu', {});
  const staging = synthWith('VayuStaging', { stage: 'staging' });

  it('shares no fixed name with the real stack, so both can live in one account', () => {
    const real = fixedNames(production);
    const copy = fixedNames(staging);
    expect(real.length).toBeGreaterThanOrEqual(6);
    expect(copy).toHaveLength(real.length);
    expect(copy.filter((name) => real.includes(name))).toEqual([]);
    for (const name of copy) expect(name.toLowerCase()).toContain('staging');
  });

  it('leaves every name in the real stack exactly as it was', () => {
    const real = fixedNames(production);
    expect(real).toEqual(
      expect.arrayContaining([
        '/vayu/assistant/enabled',
        '/vayu/watch/sends-enabled',
        'vayu_readings',
        'vayu-device',
        'Vayu',
        'Vayu spend by service',
        'Vayu spend anomalies',
      ]),
    );
  });
});

describe('the stage names', () => {
  const scope = (stage?: string): Construct => {
    const app = new App(stage === undefined ? {} : { context: { 'vayu:stage': stage } });
    return new Construct(app, 'x');
  };

  it('changes nothing without a stage', () => {
    expect(stageName(scope(), '/vayu/assistant/enabled')).toBe('/vayu/assistant/enabled');
    expect(stageIdent(scope(), 'vayu_readings')).toBe('vayu_readings');
    expect(stageOf(scope())).toBeUndefined();
  });

  it('puts the stage in, in the form each kind of name allows', () => {
    expect(stageName(scope('staging'), '/vayu/assistant/enabled')).toBe(
      '/vayu-staging/assistant/enabled',
    );
    expect(stageIdent(scope('staging'), 'vayu_readings')).toBe('vayu_staging_readings');
  });

  it('refuses a stage that would not fit in every kind of name', () => {
    for (const bad of ['Staging', 'my-stage', 'a b', '1abc', 'x'.repeat(13)]) {
      expect(() => stageOf(scope(bad))).toThrow(/Stage must be/u);
    }
  });
});
