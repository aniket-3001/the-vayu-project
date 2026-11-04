import { App } from 'aws-cdk-lib';
import { EdgeStack } from '../lib/Edge';
import { VayuStack } from '../lib/VayuStack';

const app = new App();
const alertEmail = app.node.tryGetContext('alertEmail') as string | undefined;
// e.g. `cdk deploy --context includeSite=false` while an account awaits CloudFront verification.
const includeSite = app.node.tryGetContext('includeSite') as string | undefined;
// e.g. `cdk deploy --context voice=on` adds a Hindi voice note to alerts that have Hindi wording.
const voice = app.node.tryGetContext('voice') as string | undefined;
// e.g. `cdk deploy --context originSecret=on` makes the API refuse anything that did not come through CloudFront.
const originSecret = app.node.tryGetContext('originSecret') as string | undefined;
// e.g. `cdk deploy VayuEdge -c edge=on`, then `cdk deploy Vayu -c webAclArn=arn:aws:wafv2:us-east-1:...` puts a firewall in front.
const edge = app.node.tryGetContext('edge') as string | undefined;
// e.g. `cdk deploy Vayu -c minAppVersion=0.2.0` makes phone apps older than that ask their owner to update.
const minAppVersion = app.node.tryGetContext('minAppVersion') as string | undefined;
// e.g. `cdk deploy Vayu -c crashReportingHost=o123.ingest.us.sentry.io` lets the page send crash reports there.
const crashReportingHost = app.node.tryGetContext('crashReportingHost') as string | undefined;
const webAclArn = app.node.tryGetContext('webAclArn') as string | undefined;
if (edge === 'on') {
  new EdgeStack(app, 'VayuEdge', {
    env: {
      ...(process.env.CDK_DEFAULT_ACCOUNT ? { account: process.env.CDK_DEFAULT_ACCOUNT } : {}),
    },
  });
}

new VayuStack(app, 'Vayu', {
  env: {
    region: 'ap-south-1',
    ...(process.env.CDK_DEFAULT_ACCOUNT ? { account: process.env.CDK_DEFAULT_ACCOUNT } : {}),
  },
  ...(alertEmail === undefined ? {} : { alertEmail }),
  ...(includeSite === undefined ? {} : { includeSite: includeSite !== 'false' }),
  ...(minAppVersion === undefined ? {} : { minAppVersion }),
  ...(crashReportingHost === undefined ? {} : { crashReportingHost }),
  ...(webAclArn === undefined ? {} : { webAclArn }),
  ...(originSecret === undefined ? {} : { enforceOriginSecret: originSecret === 'on' }),
  ...(voice === undefined ? {} : { voiceEnabled: voice === 'on' }),
});
