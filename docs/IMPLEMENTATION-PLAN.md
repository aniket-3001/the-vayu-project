# Making the Vayu Project a real, deployed app

> **Historical.** This is the plan the deployed app was first built to, on 10 October. The app has grown since (the measuring unit, the room card, the recorded days, Hindi). For what is true now, read `docs/AS-BUILT.md`.

The front end is built on sample data. The AWS backend is deployed and live. This plan joins them, deploys the result to a public CloudFront address, and holds the rules from the playbook and build spec while doing it.

**Done means:** one public HTTPS address that works on a phone and a laptop, reads real air data through our own API on AWS, labels every number with its source and age, has no demo controls, shows a "To be implemented" banner wherever something is not real yet, and ships with the evidence documents (safety, cost, architecture, AI boundaries) and a `make prove` that fails closed.

Not in this plan: the hardware, the demo video, and the demo itself (kept in a separate build).

## Decisions I have taken (change any of them)

| Decision                                                                                                      | Why                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The backend code moves into this repo: `apps/api`, `packages/data`, `packages/watch`, `infra`.                | This is the repo we submit, and judges read the code that is deployed.                             |
| The existing AWS stack `Vayu` (account 534212416249, ap-south-1) is updated in place.                         | It keeps the live API address, the tables, the secrets and the Telegram webhook that already work. |
| The app is served from the CloudFront root.                                                                   | One address to share.                                                                              |
| The demo (device frames, scenarios, the tour) becomes a separate build, `npm run build:demo`, never uploaded. | A deployed app cannot have a demo-mode button.                                                     |
| In the deployed app "now" is the real clock.                                                                  | The sample clock was fixed at 10 Oct, 17:30.                                                       |
| Numbers come from code; AI only words things.                                                                 | Playbook R3 and rule I6. Details in `docs/AGENT-BOUNDARIES.md`.                                    |
| I run everything except the deploy. I prepare the stack, show the `cdk diff`, and you run `cdk deploy`.       | Your standing instruction, and it is your AWS account.                                             |

## The steps

Each step ends with a gate: tests that must pass before the next step starts. Every step is its own commit.

| #   | Step                                        | What changes                                                                                                                                                                                                                                                                                  | Gate                                                                                                                                     |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | **Bring the backend home**                  | Copy the API, data clients, watch (alert loop, Telegram, Bedrock wording, Polly) and CDK stack here. Fix paths. One `make prove`.                                                                                                                                                             | The ported tests (about 400) pass in this repo; lint, types, `cdk synth` pass.                                                           |
| 1   | **Separate the demo from the real app**     | `VITE_DEMO` flag. The shell, scenarios, pill and `?demo=` leave the deployed bundle. `src/config.ts` for the API address. A real clock. A reusable "To be implemented" banner.                                                                                                                | Production bundle has no demo code (a test greps the build); app tests pass in both modes.                                               |
| 2   | **API: what the app needs**                 | New routes, each validated with zod, with the standard error shape, throttled, tested: `/v1/forecast` (weather, daily, sunrise, pollutants), `/v1/history` (hourly PM2.5 for Exposure), `/v1/stations` (monitors for the map). All cached in DynamoDB.                                        | Route tests; contract tests; rule I1 (no look-ahead) and I3 (stale gives "not sure") hold.                                               |
| 3   | **The app reads real data**                 | One data store replaces `readingForPin` and the sample hours. Today, My Air, place pages, Exposure, Map monitors, Lens and the alerts all read it. Provenance chip on every number (source, station, distance, age). Loading, offline and "no recent reading" states.                         | Every screen test passes against a fake API; a test fails if a number lacks provenance (I2); stale data gives no advice (I3).            |
| 4   | **The assistant on AWS, inside boundaries** | `POST /v1/assistant`. The rule engine answers first. Bedrock only rewords, with the number check; a free-form fallback is allowed only inside the boundaries. Guardrails, token limits, per-session and daily caps, a kill switch. Logging an outing stays deterministic and runs in the app. | Boundary tests: numbers identical with the model off; an invented number is rejected; the caps stop calls; the kill switch fails closed. |
| 5   | **Requests and alerts**                     | The demo/monitor request form posts to `/v1/requests` (DynamoDB, validated, rate-limited). Telegram: a link flow in the app, the AlertLoop with a wait for a tap, "send me a test alert" to your own linked chat only. Live scheduled sends stay off (I17).                                   | Webhook and loop tests; `watch.only_linked_recipients`, `watch.idempotent_send`, `workflow.every_wait_has_timeout`.                      |
| 6   | **Deploy the stack**                        | CDK: new routes, caps, alarms, budget, the web bucket and CloudFront serving the new app. `cdk diff` for you to read. You run the deploy.                                                                                                                                                     | `cdk synth` assertions (I9, I15); after deploy, `make smoke LIVE_URL=...` passes.                                                        |
| 7   | **Walk it on the live address**             | Every screen and every route on a phone and a laptop, signed out. Failures are fixed and redeployed.                                                                                                                                                                                          | The checklist in `docs/LIVE-CHECKLIST.md` is all ticked.                                                                                 |
| 8   | **Evidence documents**                      | `docs/safety.md`, `cost.md` (priced from the AWS pricing pages), `architecture.md` (with the Well-Architected table), `AGENT-BOUNDARIES.md`, `AS-BUILT.md`, README with honest limits, `CONTRIBUTIONS.md`, AI tools used. CI with secret scanning.                                            | `make prove` prints the rule table and fails closed on any gap.                                                                          |

## How the playbook's rules map to steps

| Rules                                                                                                       | Where they are enforced                       |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| I1 no look-ahead, I3 stale gives no advice, I4 no verdict when unsure                                       | Step 2 and 3, `core`                          |
| I2 provenance on every number, I12 labelled series                                                          | Step 3                                        |
| I6 numbers in words must be in the facts, R3 AI out of the decision                                         | Step 4                                        |
| I7 linked recipients only, I8 never twice, I9 every wait has a timeout, I10 GRAP wording, I17 replay marked | Step 5 (already built; we re-prove them here) |
| I14 no secret in the repo, I15 cost and abuse caps exist                                                    | Step 6 and 8                                  |
| R11 cost per unit, R16 where every number comes from                                                        | Step 8 and 3                                  |

## What stays "To be implemented" (banner on the screen)

The device itself (readings, performance, the cleaner switching on and off), the Hindi voice note until a Hindi speaker has listened to it, and anything else we find that is still made up when step 3 is done. A made-up number is never shown without that banner.

## The one thing only you can do

Run `cdk deploy` (step 6) and the upload commands after it. I will give you the exact commands and the diff to read first.
