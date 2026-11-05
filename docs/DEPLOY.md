# Deploying: staging first, then the real thing

`.github/workflows/deploy.yml` deploys from GitHub. **It has never been run.** It was written without access to the AWS account, so
expect to fix small things on the first run, and keep deploying by hand (`docs/SETUP-GUIDE.md`) until it has worked once.

## What it does

1. **checks**: the tests, lint and types.
2. **staging**: deploys a separate copy of the whole stack (`VayuStaging`, `-c stage=staging`), uploads the site to it, and runs the
   live check against its address. Staging has its own tables, API, sign-in pool and address. It shares only the provider keys in
   Secrets Manager, and runs none of the scheduled jobs, so it does not use up the real stack's OpenAQ allowance. Names that
   AWS allows only one of per account (the kill-switch parameters, the IoT rule, the dashboard) get the stage in them; the real stack's
   names are unchanged (`infra/lib/stage.ts`, tested in `infra/test/Stage.test.ts`).
3. **production** (only when you pick "production"): shows `cdk diff`, **waits for a person to approve**, then deploys the stack,
   uploads the site and runs the live check.

## One-time setup (the account owner)

1. In AWS IAM, add GitHub as an OpenID Connect provider (`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`).
2. Create a role that GitHub may assume, trusted only for this repository and these environments, for example:

   ```json
   {
     "Effect": "Allow",
     "Principal": {
       "Federated": "arn:aws:iam::<account id>:oidc-provider/token.actions.githubusercontent.com"
     },
     "Action": "sts:AssumeRoleWithWebIdentity",
     "Condition": {
       "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
       "StringLike": {
         "token.actions.githubusercontent.com:sub": [
           "repo:aniket-3001/the-vayu-project:environment:staging",
           "repo:aniket-3001/the-vayu-project:environment:production"
         ]
       }
     }
   }
   ```

   Give the role what `cdk deploy` needs. The simplest safe start is the CDK bootstrap roles: allow it to `sts:AssumeRole` on
   `arn:aws:iam::<account id>:role/cdk-*`, so it can do only what CDK's own deploy roles can. (`cdk bootstrap` must have been run.)

3. In GitHub: Settings → Environments → create **staging** and **production**. On **production**, add **required reviewers**:
   that is the approval step. On both, add the variable `AWS_DEPLOY_ROLE_ARN` (the role's ARN).
4. Settings → Branches → protect `main`: require the `ci` workflow to pass and a pull request before merging.

## Deploying

Actions → **deploy** → Run workflow → choose `staging` to try a change, or `production` to go through staging and then the real stack.

## Known gaps

- The staging live check is informational until a first run shows which of its checks make sense there.
- No automatic rollback. If the live check fails after production, redeploy the previous commit (see `RUNBOOK.md`).
- The shared provider secrets (`vayu/openaq-api-key`, `vayu/firms-map-key`, `vayu/telegram-bot-token`) are used by both stacks.

## Keeping your deploy options

A plain `cd infra && npx cdk deploy Vayu` reads `infra/deploy.local.json` (not committed; copy `infra/deploy.local.example.json`) for
the options this account always uses: `alertEmail`, `spendMonitorArn`, `webAclArn`, `originSecret`, `crashReportingHost`. Without
that file, leaving one off the command line quietly switches that protection off. `-c name=value` still overrides the file, and a
staging copy (`-c stage=staging`) ignores the file on purpose, so it never shares the real firewall or mails the real alarm address.
