# Runbook: when something breaks

For whoever is holding the phone when an alarm arrives. Region `ap-south-1`, stack `Vayu`, profile `vayu`
(`export AWS_PROFILE=vayu`). Alarms reach you only if an email is subscribed to the alarm topic (see
`PRODUCTION-CHECKLIST.md`).

## First five minutes

1. Open the CloudWatch dashboard **Vayu** (API requests and errors, API Lambda, harvest runs). Note which alarm fired.
2. Run the live check: `npx tsx tests/smoke/live.ts` (it defaults to the live address). The first failing line names the part.
3. Look at the logs of the part that failed: `aws logs tail /aws/lambda/<function name> --since 30m` (find the name with
   `aws lambda list-functions --query "Functions[?contains(FunctionName,'Vayu')].FunctionName"`).
4. Decide: switch the costly part off (below), roll back, or wait for a provider to recover.

## Switches (no deploy needed)

| To stop                                                  | Command                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| The assistant and spoken answers (model and voice spend) | `aws ssm put-parameter --name /vayu/assistant/enabled --value false --overwrite`   |
| Turn them back on                                        | `aws ssm put-parameter --name /vayu/assistant/enabled --value true --overwrite`    |
| Alert sends (Telegram)                                   | `aws ssm put-parameter --name /vayu/watch/sends-enabled --value false --overwrite` |

The assistant is on only for the exact value `true`; anything else, or an error reading it, is off. The app then answers from the fixed
rules and says so.

## By symptom

| Symptom                                                 | Likely cause                                                | What to do                                                                                                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiErrors` or `Api5xx` alarm                           | A bug in a release, or a dependency down                    | Check the API logs. If it began at a deploy, redeploy the previous commit (`git checkout <good sha> && cd infra && npx cdk deploy`).                                             |
| `HarvestStopped` or `StationsStopped`                   | The EventBridge schedule is off, or the Lambda cannot start | Check the schedule's state in the console (the stack can deploy it `DISABLED`). Re-enable it.                                                                                    |
| `HarvestErrors`                                         | OpenAQ key invalid or rate-limited, or Open-Meteo down      | Check the log line. A bad key: update secret `vayu/openaq-api-key`. Otherwise wait: the app falls back to the regional model and labels it Estimate.                             |
| Cards say "Estimate" everywhere                         | No monitor has a recent reading (OpenAQ down)               | Nothing to fix in our code. Say so on the status line if it lasts hours.                                                                                                         |
| Map blank                                               | The map's monitors snapshot is stale or empty               | Check `StationsStopped`; run the stations function once by hand from the console.                                                                                                |
| Assistant answers only from rules                       | Kill switch off, daily cap reached, or Bedrock down or slow | Check the parameter above. Caps reset daily. Bedrock down needs no action: the rules answer instead.                                                                             |
| Cost alarm or budget email                              | Traffic flood, or a loop                                    | Turn the assistant switch off first. Look at API Gateway and CloudFront request counts. See `cost.md` for what each cap allows. A flood against CloudFront itself is not capped. |
| Nobody can sign in                                      | Cognito, or the account config route                        | Check `GET /v1/auth-config`. Cognito's own email allows about 50 a day, so a burst of sign-ups can run into that.                                                                |
| Phone app shows a blank or wrong screen after an update | A bad app build                                             | Users keep the old build until they update. Fix forward and ship a new build; there is no forced-update check yet.                                                               |

## After it is over

Add a short entry to `learning-log.md`: what broke, how it was found, how it was fixed. If an alarm did not fire when it should have,
fix the alarm in `infra/lib/Operations.ts` first.
