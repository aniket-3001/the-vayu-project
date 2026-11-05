import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnWebACL } from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';

export interface EdgeStackProps extends StackProps {
  /** Requests one address may make in any five minutes before it is blocked, across the whole site. Minimum 10. */
  readonly sitePer5Min?: number;
  /** The same for the two routes that cost money (the assistant and spoken answers). */
  readonly costlyPer5Min?: number;
}

const metric = (name: string): CfnWebACL.VisibilityConfigProperty => ({
  cloudWatchMetricsEnabled: true,
  sampledRequestsEnabled: true,
  metricName: name,
});

const managed = (
  name: string,
  priority: number,
  overrides: CfnWebACL.RuleActionOverrideProperty[] = [],
): CfnWebACL.RuleProperty => ({
  name,
  priority,
  overrideAction: { none: {} },
  statement: {
    managedRuleGroupStatement: {
      vendorName: 'AWS',
      name,
      ...(overrides.length === 0 ? {} : { ruleActionOverrides: overrides }),
    },
  },
  visibilityConfig: metric(name),
});

/**
 * The web firewall for the public address. CloudFront can only use one made in us-east-1, so it is a stack of its own:
 * deploy it first (`cdk deploy VayuEdge -c edge=on`), then give its ARN to the main stack
 * (`cdk deploy Vayu -c webAclArn=<the ARN>`). It adds what the API's own throttle cannot: a limit for each address
 * and AWS's lists of known-bad requests and addresses.
 */
export class EdgeStack extends Stack {
  readonly webAcl: CfnWebACL;

  constructor(scope: Construct, id: string, props: EdgeStackProps = {}) {
    super(scope, id, { ...props, env: { ...props.env, region: 'us-east-1' } });
    const site = props.sitePer5Min ?? 2000;
    const costly = props.costlyPer5Min ?? 100;

    this.webAcl = new CfnWebACL(this, 'WebAcl', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: metric('VayuWebAcl'),
      rules: [
        {
          // The assistant and the voice call a paid model, so one address gets far fewer of them.
          name: 'CostlyRoutesPerAddress',
          priority: 0,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: costly,
              aggregateKeyType: 'IP',
              scopeDownStatement: {
                orStatement: {
                  statements: ['/v1/assistant', '/v1/speech'].map((path) => ({
                    byteMatchStatement: {
                      searchString: path,
                      fieldToMatch: { uriPath: {} },
                      textTransformations: [{ priority: 0, type: 'NONE' }],
                      positionalConstraint: 'STARTS_WITH',
                    },
                  })),
                },
              },
            },
          },
          visibilityConfig: metric('CostlyRoutesPerAddress'),
        },
        {
          name: 'SitePerAddress',
          priority: 1,
          action: { block: {} },
          statement: { rateBasedStatement: { limit: site, aggregateKeyType: 'IP' } },
          visibilityConfig: metric('SitePerAddress'),
        },
        managed('AWSManagedRulesAmazonIpReputationList', 2),
        managed('AWSManagedRulesKnownBadInputsRuleSet', 3),
        // The common set limits a request body to 8 KB, which a saved account with several places could pass: count it, do not block.
        managed('AWSManagedRulesCommonRuleSet', 4, [
          { name: 'SizeRestrictions_BODY', actionToUse: { count: {} } },
        ]),
      ],
    });

    new CfnOutput(this, 'WebAclArn', { value: this.webAcl.attrArn });
  }
}
