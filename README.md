# Vayu Air

A free app that turns public air-quality data into a daily decision for a Delhi family, school or society: is it a good time for a walk, is school safe, do we need a mask, are the windows better shut.

AWS Air track submission. **Live: https://d3lmq1mze2gup3.cloudfront.net** (works on a phone or a laptop; no sign-in).

## What it does

| Screen        |                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **My Air**    | Pin places (home, school, office, a park, or any place in north India). Each shows the air now, the weather, and the nearest monitor's name, distance and age. Alerts for the next three days, and small tasks for today. |
| **Exposure**  | A 24-hour dial of the air a person breathed: at home, at work or school, and outdoors. Add the people in a family, with school or work hours. Log outdoor time.                                                           |
| **Map**       | The air across the world: every monitor, wind, fires, and the colour between.                                                                                                                                             |
| **AR Lens**   | Point a phone camera and see the air as particles, with a scene for each place.                                                                                                                                           |
| **Assistant** | Ask a question or tell it something ("Asha walked in the park for 40 minutes").                                                                                                                                           |

Every number says whether it is **Live** (a named monitor, how far, how old) or an **Estimate** (a regional model). Monitor readings older than six hours are not used, and nothing is advised from them.

## What is real, and what is not

The app reads real data (OpenAQ monitors, Open-Meteo weather and forecast, NASA FIRMS fires) through its own API on AWS. It has no demo mode.

The air monitor and purifier this project is about are **not built**. The Devices screen says "To be implemented", shows no measurements, and counts nothing from a device. `docs/AS-BUILT.md` lists what is live, what is built but switched off, and what is not built.

## How it is built

CloudFront serves the app from S3 and passes `/v1/*` to an API Gateway HTTP API and a Lambda; DynamoDB caches; two scheduled Lambdas read the providers so visitors do not; Bedrock (Amazon Nova Micro, with a guardrail) rewords the assistant's answers; everything is CDK in TypeScript. See `docs/architecture.md`.

## The rules it holds

Code decides and AI only words things. `docs/safety.md` lists each rule, where the code enforces it and the test that fails if it breaks. `docs/AGENT-BOUNDARIES.md` says what the assistant may and may not do, and its limits. `docs/cost.md` prices every unit from the AWS price list and says what each cap allows.

| Limit                                | Value                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Assistant questions                  | 40 per caller and 500 for everyone, per day; 220 tokens an answer; 6 seconds; a kill switch |
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
make prove     # lint, types, every test, cdk synth, and a check that the deployed bundle holds no prototype code
make local-api # in one terminal: the API on your machine (real monitors need OPENAQ_API_KEY in the environment)
make local     # in another: the app on your machine, reading it
```

| Command                           | What                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `make prove`                      | Everything above; fails closed.                                               |
| `make deploy-diff`                | What a deploy would change, read-only.                                        |
| `make deploy-site`                | Build the app for the live address and upload it.                             |
| `make smoke LIVE_URL=https://…`   | Check the data, the rules and the headers on a live address.                  |
| `npm run build:demo -w @vayu/web` | The separate demo build (device frames, scenarios, the tour). Never uploaded. |

The stack deploys with `cd infra && npx cdk deploy`. It needs three secrets made by hand first: `vayu/openaq-api-key`, `vayu/firms-map-key` and `vayu/telegram-bot-token`.

## Documents

|                               |                                                          |
| ----------------------------- | -------------------------------------------------------- |
| `docs/AS-BUILT.md`            | What is live, what is not                                |
| `docs/architecture.md`        | The parts, the data, and the Well-Architected pillars    |
| `docs/safety.md`              | Every rule, how it is enforced, the test that proves it  |
| `docs/AGENT-BOUNDARIES.md`    | What the AI may and may not do                           |
| `docs/cost.md`                | What it costs, per unit and at each limit                |
| `docs/LIVE-CHECKLIST.md`      | What was checked on the live address, and what was found |
| `docs/IMPLEMENTATION-PLAN.md` | The plan this was built to                               |

## Licence

See `LICENSE`.
