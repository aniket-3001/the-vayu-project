import { App, Stack } from 'aws-cdk-lib';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { EdgeStack } from '../lib/Edge';
import { Site, contentSecurityPolicy, CONTENT_SECURITY_POLICY } from '../lib/Site';

interface Rule {
  Name: string;
  Statement: { RateBasedStatement?: { Limit: number } };
}

describe('the web firewall', () => {
  const stack = new EdgeStack(new App(), 'Edge');
  const template = Template.fromStack(stack);

  it('is a CloudFront firewall, which must live in us-east-1', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', { Scope: 'CLOUDFRONT' });
    expect(stack.region).toBe('us-east-1');
  });

  it('limits each address, harder on the routes that cost money', () => {
    const acl = Object.values(template.findResources('AWS::WAFv2::WebACL'))[0];
    const rules = (acl?.Properties as { Rules: Rule[] }).Rules;
    const limit = (name: string): number | undefined =>
      rules.find((r) => r.Name === name)?.Statement.RateBasedStatement?.Limit;
    expect(limit('SitePerAddress')).toBe(2000);
    expect(limit('CostlyRoutesPerAddress')).toBe(100);
  });

  it('uses the AWS lists of bad requests and addresses, and only counts the body-size rule', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Statement: {
            ManagedRuleGroupStatement: Match.objectLike({
              Name: 'AWSManagedRulesAmazonIpReputationList',
            }),
          },
        }),
        Match.objectLike({
          Statement: {
            ManagedRuleGroupStatement: Match.objectLike({
              Name: 'AWSManagedRulesCommonRuleSet',
              RuleActionOverrides: [{ Name: 'SizeRestrictions_BODY', ActionToUse: { Count: {} } }],
            }),
          },
        }),
      ]),
    });
  });

  it('is attached to the site only when its ARN is given', () => {
    // The Site on its own, behind a bare API: a whole stack would bundle every function again for each case.
    const siteWith = (webAclArn?: string): Template => {
      const stack = new Stack(new App(), 'S');
      new Site(stack, 'Site', { api: new HttpApi(stack, 'Api'), webAclArn });
      return Template.fromStack(stack);
    };
    siteWith().hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.not(Match.objectLike({ WebACLId: Match.anyValue() })),
    });
    const arn = 'arn:aws:wafv2:us-east-1:123456789012:global/webacl/x/y';
    siteWith(arn).hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ WebACLId: arn }),
    });
  });
});

describe('the content policy', () => {
  it('allows no crash-reporting host unless one is given', () => {
    expect(CONTENT_SECURITY_POLICY).not.toContain('sentry');
    const withHost = contentSecurityPolicy(['o123.ingest.us.sentry.io']);
    expect(withHost).toMatch(/connect-src [^;]*https:\/\/o123\.ingest\.us\.sentry\.io/u);
    expect(withHost).toContain("script-src 'self'");
  });

  it('refuses anything that is not a plain host name', () => {
    expect(() => contentSecurityPolicy(['evil.com; script-src *'])).toThrow();
    expect(() => contentSecurityPolicy(['*.sentry.io'])).toThrow();
    expect(() => contentSecurityPolicy(["a.com 'unsafe-eval'"])).toThrow();
  });
});
