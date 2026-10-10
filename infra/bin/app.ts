import { App } from 'aws-cdk-lib';
import { VayuStack } from '../lib/VayuStack';

const app = new App();
const alertEmail = app.node.tryGetContext('alertEmail') as string | undefined;
// e.g. `cdk deploy --context includeSite=false` while an account awaits CloudFront verification.
const includeSite = app.node.tryGetContext('includeSite') as string | undefined;
// e.g. `cdk deploy --context voice=on` adds a Hindi voice note to alerts that have Hindi wording.
const voice = app.node.tryGetContext('voice') as string | undefined;

new VayuStack(app, 'Vayu', {
  env: {
    region: 'ap-south-1',
    ...(process.env.CDK_DEFAULT_ACCOUNT ? { account: process.env.CDK_DEFAULT_ACCOUNT } : {}),
  },
  ...(alertEmail === undefined ? {} : { alertEmail }),
  ...(includeSite === undefined ? {} : { includeSite: includeSite !== 'false' }),
  ...(voice === undefined ? {} : { voiceEnabled: voice === 'on' }),
});
