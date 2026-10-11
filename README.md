# Vayu Air

**One clear answer for the air at the places you care about.** Vayu Air is a free web app that turns public air-quality data into a daily decision for a Delhi family, school or society: is it a good time for a walk, is school safe, do we need a mask, are the windows better shut. A small measuring unit (an ESP32 and a laser particle sensor) adds the air in your own room.

> A parent in Delhi sees "AQI 162" for the city. Their child's school is kilometres from the nearest monitor, and the morning assembly is in the open. The app says which monitor the number came from, how far away it is and how old the reading is, what GRAP stage the last day points to (our estimate, never the order), and whether assembly should be inside.

Live: **https://d3lmq1mze2gup3.cloudfront.net** (a phone or a laptop; no sign-in) · The recorded week: **https://d3lmq1mze2gup3.cloudfront.net/#/week** · Video: _to be added_ · Blog: [`docs/blog.md`](docs/blog.md) · Run it on your machine: `make local`

AWS Air track submission, 8 to 11 October 2026.

## It is all real data

Every number in the live app comes from a real source (OpenAQ monitors, Open-Meteo weather, forecast and wind, MET Norway wind as a second source, NASA FIRMS fires) through our own API on AWS. There is no demo mode and no made-up number in the deployed bundle; `make prove` fails if one gets in.

**The recorded week is real too.** Open `/#/week` and the same app plays seven real days from last winter, one at a time, as if each were today at 8 am: 6 Oct 2025 (rain), 7 Oct (the clean day after), 21 Oct (after Diwali), 31 Oct (stubble fires), 12 Nov (smog), 22 Dec (GRAP Stage IV by our estimate) and 30 Mar 2026 (wind). The air comes from four Delhi monitors in OpenAQ's public archive, the weather from Open-Meteo's archive, the fires from NASA FIRMS. It is there so you can see every feature without waiting for a bad day, and the page says it is recorded. Cleaning is two rules, written in the file and counted (see [`docs/AS-BUILT.md`](docs/AS-BUILT.md)).

The only made-up days in the repository are in the separate prototype build (`npm run build:demo`: device frames, scenarios, a simulated Bluetooth unit), which is never uploaded and is labelled "Sample data" wherever it shows a number.

## Try it in two minutes

1. Open the live address. Add a place (search, or "Detect my location"): its card shows the AQI, the weather, the nearest monitor's name, distance and age, and the next three days.
2. Open the card: **Insights for this place** (a school's morning assembly, a walk in a park, alerts that apply there).
3. Open the **Map** (every monitor, wind, fires), **Exposure** (the air a person breathed, hour by hour) and **AIR Lens** (the air as particles in front of the camera).
4. Press the round **Ask** button and ask "When can I walk today?" in English or हिन्दी. Fixed rules decide the answer; the model only rewords it.
5. Open `/#/week` and step through the seven recorded days.
6. With a measuring unit: **Add device** at the top right of My Air, then Connect over Bluetooth (Chrome on a computer or Android; not iPhone Safari). See [`docs/UNIT.md`](docs/UNIT.md).

## What it does

| Screen                |                                                                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **My Air**            | Alerts for the next three days (GRAP stages, smog, stubble burning, rain, wind) and small tasks for today, then your cards: **Your room** (when a unit is added), then your places, each in the colour of its air.                  |
| **Your room**         | The unit's live reading against the air outside at your place, the gap between them, a test that marks "purifier on" or "window opened" and shows how far the air moved, the room's day by hour, and a few plain insights.          |
| **Exposure**          | A 24-hour dial of the air a person breathed: at home, at work or school, and outdoors. Add the people in a family, with school or work hours. Log outdoor time. Hours the unit measured replace the outside reading at the address. |
| **Map**               | The air across the world: every monitor, wind, fires, and the colour between.                                                                                                                                                       |
| **AIR Lens**          | Point a phone camera and see the air as particles, with a scene for each place; an eye button makes the card see-through.                                                                                                           |
| **Assistant**         | Ask a question or tell it something ("Asha walked in the park for 40 minutes"), in English or Hindi, read aloud in either.                                                                                                          |
| **The recorded week** | The whole app on seven real past days, labelled recorded.                                                                                                                                                                           |

Every number says whether it is **Live** (a named monitor, how far, how old), an **Estimate** (a regional model) or **Measured** (your own unit). Monitor readings older than six hours are not used, and nothing is advised from them.

## Where AWS fits

Each service is in `infra/` as CDK (TypeScript); one `cdk deploy` makes the stack.

| Service                                | Role                                                                                                            | Where                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| CloudFront, S3                         | Serve the app over HTTPS from a private bucket; pass `/v1/*` to the API; security headers; one address for both | `infra/lib/Site.ts`                                |
| API Gateway (HTTP API), Lambda         | Every `/v1` route; every request and answer is checked against a contract; throttled                            | `infra/lib/VayuStack.ts`, `apps/api`               |
| DynamoDB                               | Cache of the harvest and the map's monitors, daily quotas, requests and fire reports (with expiry)              | `infra/lib/VayuStack.ts`                           |
| EventBridge Scheduler, Lambda          | The harvest (every 15 min) and the map's monitor job (every 30 min), so visitors never call a provider          | `infra/lib/Harvest.ts`, `infra/lib/Stations.ts`    |
| Amazon Bedrock (Nova Micro), Guardrail | Only rewords an answer the rules already decided; the guardrail checks the question and the answer              | `infra/lib/Assistant.ts`, `packages/watch`         |
| Amazon Polly                           | Reads answers aloud (Kajal, English and Hindi)                                                                  | `infra/lib/Assistant.ts`                           |
| Step Functions                         | The alert loop (send, wait for a tap, remind, escalate) and "did it work?"; every task has a time limit         | `infra/lib/AlertLoop.ts`, `infra/lib/FixCheck.ts`  |
| Secrets Manager, SSM                   | The provider keys; the assistant's kill switch                                                                  | `infra/lib/VayuStack.ts`, `infra/lib/Assistant.ts` |
| CloudWatch, X-Ray                      | One alarm for each thing that can quietly stop, a dashboard, traces                                             | `infra/lib/Operations.ts`                          |
| IoT Core, Firehose, S3, Athena         | Built and tested for device messaging; **not used** by the Bluetooth unit (it talks to the phone)               | `infra/lib/Ingest.ts`, `infra/lib/Analytics.ts`    |
| AWS CDK                                | The whole stack, with assertion tests that the caps and permissions exist                                       | `infra/`                                           |

AWS open source: CDK. We did not use Strands, Cedar or Powertools.

## The rules it holds

The headline rule: **code decides and AI only words things.** If the model's answer holds a number that is not in the facts, the plain wording is sent instead; a Hindi answer never touches the model. [`docs/safety.md`](docs/safety.md) lists every rule, where the code enforces it and the test that fails if it breaks. [`docs/AGENT-BOUNDARIES.md`](docs/AGENT-BOUNDARIES.md) says what the assistant may and may not do. [`docs/claims.md`](docs/claims.md) is every public claim with what supports it.

## What is built, and what is not

| Part                                                  | State                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| The web app, the API, the stack, the recorded week    | Live, seen working                                                                                                               |
| The measuring unit (ESP32-S3 + SPS30, over Bluetooth) | Built and running: the board reads the sensor, and the live site connects, shows readings, and counts measured hours in Exposure |
| Accuracy of the unit                                  | **Not measured.** It has not been compared with a monitor over days. It is a low-cost sensor and is labelled that way            |
| Telegram alerts                                       | Built and tested against fakes; live scheduled sends are off; no in-app screen to link a chat                                    |
| The air purifier and its automatic switching          | **Not built.** A sample cleaner card exists, with a "To be implemented" banner and made-up readings that never count             |
| Phone Bluetooth                                       | Chrome on a computer is tested; Android Chrome is not; iPhone Safari cannot                                                      |

Details, with dates: [`docs/AS-BUILT.md`](docs/AS-BUILT.md). What was checked by hand on the live address: [`docs/LIVE-CHECKLIST.md`](docs/LIVE-CHECKLIST.md).

## Cost

[`docs/cost.md`](docs/cost.md) prices every unit from the AWS price list and says what each cap allows.

| Limit                                | Value                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Assistant questions                  | 40 per caller and 500 for everyone, per day; 220 tokens an answer; 6 seconds; a kill switch |
| Spoken answers                       | 400 characters a time; 12,000 per caller and 60,000 for everyone, per day                   |
| API                                  | 25 requests a second (3 for the assistant, 1 for the request form)                          |
| Request forms                        | 5 per caller and 200 for everyone, per day                                                  |
| Idle cost                            | about $4.50 a month                                                                         |
| Assistant question                   | about $0.0008                                                                               |
| Largest steady cost the limits allow | assistant about $12.70 a month; API about $6 a day if hit without a break                   |

Not capped: a flood against CloudFront itself. See `docs/cost.md`.

## Run it

Needs Node 22 or later.

```bash
npm ci
make prove     # lint, types, every test (1,243), cdk synth, and a check that the deployed bundle holds no prototype code
make local-api # in one terminal: the API on your machine (real monitors need OPENAQ_API_KEY in the environment)
make local     # in another: the app on your machine, reading it
```

| Command                           | What                                                                        |
| --------------------------------- | --------------------------------------------------------------------------- |
| `make prove`                      | Everything above; fails closed.                                             |
| `make deploy-diff`                | What a deploy would change, read-only.                                      |
| `make deploy-site`                | Build the app for the live address and upload it.                           |
| `make smoke LIVE_URL=https://…`   | Check the data, the rules and the headers on a live address.                |
| `npm run build:demo -w @vayu/web` | The separate prototype build (made-up days, device frames). Never uploaded. |
| `node scripts/record-week.mjs`    | Remake the recorded week from the public archives (needs a NASA FIRMS key). |

The stack deploys with `cd infra && npx cdk deploy`. It needs three secrets made by hand first: `vayu/openaq-api-key`, `vayu/firms-map-key` and `vayu/telegram-bot-token`.

## Repository map

| Path                 | What                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web`           | The app (React, MapLibre). `src/air` is where real data enters; `src/week` is the recorded week; `src/devices` is the measuring unit |
| `apps/api`           | The API Lambda, the stations Lambda and the routes                                                                                   |
| `packages/contracts` | The shape of every request and answer (zod)                                                                                          |
| `packages/core`      | The rules: air bands, timeline, windows, verdicts, the assistant's fixed answers (English and Hindi)                                 |
| `packages/data`      | Clients for OpenAQ, Open-Meteo, MET Norway and FIRMS, and the cache                                                                  |
| `packages/watch`     | The alert loop, Telegram, Bedrock wording, the number check                                                                          |
| `infra`              | The CDK stack and its tests                                                                                                          |
| `firmware/vayu-unit` | The ESP32-S3 sketch for the measuring unit                                                                                           |
| `scripts`            | Build, deploy, check and recording scripts                                                                                           |
| `tests/smoke`        | The live check                                                                                                                       |

## Documents

|                                   |                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `docs/AS-BUILT.md`                | What is live, what is not                                                    |
| `docs/architecture.md`            | The parts, the data, and the Well-Architected pillars                        |
| `docs/architecture-animated.html` | An animated diagram of the same, for the video (open it in a browser)        |
| `docs/safety.md`                  | Every rule, how it is enforced, the test that proves it                      |
| `docs/AGENT-BOUNDARIES.md`        | What the AI may and may not do                                               |
| `docs/claims.md`                  | Every public claim, and what supports it                                     |
| `docs/cost.md`                    | What it costs, per unit and at each limit                                    |
| `docs/UNIT.md`                    | The measuring unit: parts, wiring, protocol, what may be said                |
| `docs/LIVE-CHECKLIST.md`          | What was checked on the live address, and what was found                     |
| `docs/SUBMISSION.md`              | The words for the form, the video script, the AI tools used, feedback on AWS |
| `docs/blog.md`                    | The write-up                                                                 |
| `docs/learning-log.md`            | What broke and how it was fixed                                              |
| `docs/IMPLEMENTATION-PLAN.md`     | The plan the deployed app was first built to (historical)                    |
| `CONTRIBUTIONS.md`                | Who did what, and how AI was used                                            |
| `DESIGN.md`                       | The visual design brief                                                      |

## AI tools used

Claude Code wrote and tested most of the code and the documents, directed and reviewed by me, the only author ([`CONTRIBUTIONS.md`](CONTRIBUTIONS.md)). At run time, Amazon Bedrock (Nova Micro, behind a guardrail) rewords the assistant's answers and cannot act ([`docs/AGENT-BOUNDARIES.md`](docs/AGENT-BOUNDARIES.md)).

## Licence

See `LICENSE`.
