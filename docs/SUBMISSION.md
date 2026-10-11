# Submission pack

Words for the hackathon form and the video. Everything here matches `docs/AS-BUILT.md`; where the two differ, that page is right.
Lines marked **(confirm)** are for me to check or fill before sending.

## Project description (short)

Vayu Air is a free app that turns public air-quality data into a daily decision for a Delhi family, school or society:
is it a good time for a walk, is school safe, do we need a mask, are the windows better shut.
It shows the air at the places you set (home, school, work, a park), what a person breathed over the day (Exposure),
a world map of monitors, wind, fires and the colour between them, and an AIR Lens that turns a number into particles
in front of the camera. Alerts for the next three days follow the GRAP stages, smog, stubble burning, rain and wind, and
the Insights for a place say what that means for a school's assembly or a walk in a park.

Every number says whether it is **Live** (a named monitor, how far, how old) or an **Estimate** (a regional model).
Nothing is advised from a reading older than six hours. A small measuring unit (ESP32-S3 and an SPS30 laser particle sensor)
connects over Bluetooth and becomes a "Your room" card: the room's live air against the air outside, with the hours it
measured counted in Exposure. A prototype air cleaner (a fan, a filter and a foam pre-filter in a box) is built and its outlet airflow measured at about 191 cfm; its CADR is not measured, it does not switch by itself, and the app's cleaner card is a sample that says "To be implemented".

**It is all real data.** The live app reads real monitors, weather and satellite fires. The recorded week (`/#/week`) is seven
real days from the public archives played through the same app, labelled recorded. The only made-up days are in a separate
prototype build that is never uploaded.

Live: https://d3lmq1mze2gup3.cloudfront.net

## How it uses AWS

CloudFront and S3 serve the app; API Gateway and a Lambda serve `/v1`; DynamoDB caches and holds quotas; EventBridge
Scheduler runs the harvest and the map's monitor job so visitors never call a provider; Bedrock (Amazon Nova Micro, with
a guardrail) only rewords answers that fixed rules already decided; Polly reads answers aloud; Step Functions run the
alert loop and "did it work?"; Secrets Manager, an SSM kill switch, throttles and daily caps keep it safe and cheap;
everything is CDK in TypeScript. See `docs/architecture.md`, `docs/cost.md` and `docs/safety.md`.

## Video script (about four minutes)

| Time      | Show                                                                                                                                                                                                                                                                                                                                                                  | Say                                                                                                                                                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:30 | A hazy Delhi morning; a parent checking the air; the app's My Air                                                                                                                                                                                                                                                                                                     | The problem: the numbers exist but nobody can act on them; one monitor is kilometres from your child's school. The solution: Vayu Air, one clear answer for each place you care about, and a ₹4,000 unit that measures the room itself.                                  |
| 0:30–1:30 | Phone, the deployed app: add Home, School and Work; the live location card; set who each place is for; read a card's fields                                                                                                                                                                                                                                           | How to set it up the first time, and what each field means: the AQI and its level, the 3-day strip, where the number came from (a named monitor, how far, how old), the GRAP pill, the assembly line.                                                                    |
| 1:30–2:10 | The unit on a desk; Add device; Connect over Bluetooth; the Your room card and its page: the live reading, room against outside as two lines, the purifier test; Exposure counting the hour                                                                                                                                                                           | The unit (ESP32 and a laser particle sensor, about ₹4,000) streams to the phone. The reading is set beside the nearest monitor's, and the hours spent there count in Exposure as measured. For the price of one monitoring station, thousands of these: hyperlocal data. |
| 2:10–3:10 | The **recorded week** (open `/#/week` on the deployed site): seven real days, one chip each. 6 Oct 2025 rain (the air clears); 7 Oct the clean day after; 21 Oct after Diwali; 31 Oct stubble fires (the alert, the fire map); 12 Nov smog; 22 Dec GRAP Stage IV by our estimate (school likely closed); 30 Mar wind. Show tips, alerts, the map and Exposure on each | These are real days from the OpenAQ archive, NASA's fire detections and the weather record, played through the same app. The stage is our own unofficial estimate, never the order.                                                                                      |
| 3:10–4:00 | An **animated architecture diagram**: phone to CloudFront to API Gateway to Lambda, the scheduled jobs, DynamoDB, Bedrock with its guardrail, Polly, the kill switch and caps                                                                                                                                                                                         | How the data flows, and how permissions and guardrails hold: the model only words answers the rules decided, every number is checked, daily caps and a kill switch, secrets in Secrets Manager.                                                                          |

Hardware segment, add: the cleaner prototype built in five steps (the collage in `docs/images/collage-build.jpg`) and the anemometer reading (about 191 cfm, airflow). If you show the Dyson HushJet Purifier Compact (₹29,900; CADR 250 m³/h, as published), follow `docs/COMPARISON.md`: its number is a CADR and ours is airflow, so do not set them side by side as a win; compare prices only with our real bill of materials, and CADR only after our smoke-decay test.

The recorded week is built (`apps/web/src/week`, data made by `scripts/record-week.mjs`, see `docs/AS-BUILT.md`), and so
is the animated architecture diagram: open `docs/architecture-animated.html` in a browser (five scenes; Space plays or
pauses, arrow keys step, `#step=3` holds on a scene).

## What each person did **(confirm)**

I built this alone (`CONTRIBUTIONS.md`). The app, the API and the AWS stack were written with an AI coding assistant
(Claude Code), directed and reviewed by me, and every change goes through `make prove` (lint, types, tests, `cdk synth`,
bundle check). I designed, wired, flashed and tested the measuring unit myself.

## AI tools used

- Claude Code: writing and testing the code, the firmware and the documents, from my direction.
- Amazon Bedrock, Nova Micro, with a guardrail: rewording the assistant's answers at run time. It has no tools and
  cannot act. See `docs/AGENT-BOUNDARIES.md`.
- Amazon Polly: reads answers aloud in English and Hindi. Hindi answers are fixed wording and never go through the model.

## Feedback on AWS **(confirm and edit)**

Things we hit, in the order we hit them:

- CloudFront forwarding the viewer's `Host` header to API Gateway gives a 403; the origin request policy has to leave it out.
- The Bedrock guardrail's prompt-attack filter blocks instructions placed in the user turn. Putting the rewording
  instruction in the system prompt works.
- `cdk deploy` behind a corporate network needs the system certificate store (`NODE_OPTIONS=--use-system-ca`).
- Scheduled jobs that call a provider need their own time budget inside the function's time limit, and a schedule that
  never runs needs its own alarm; neither is a default.
- Lambda egress addresses differ from a laptop's, which is why the wind and air model are asked from the API once for
  everyone rather than from each browser. Open-Meteo counts each point of a many-point request as a call against the
  address's daily allowance, so a map's wind grid used it up quickly.
- Bedrock needs the regional inference profile id (`apac.amazon.nova-micro-v1:0`), not the bare model id, in ap-south-1.

## Honest limits

- The measuring unit reads a real sensor and reaches the app, but its accuracy has **not** been compared with a monitor, so
  it is a low-cost sensor shown beside the nearest monitor, never "scientific-grade". See `docs/claims.md`.
- The cleaner's 191 cfm is airflow at the outlet, not CADR: the smoke-decay test has not been run, and it does not switch by itself. Rules I13 and I16 are untested on a device.
- Telegram alerts are built and tested against fakes; live scheduled sends are off and there is no in-app screen to link a chat.
- Bluetooth: Chrome on a computer is tested; Android Chrome is not; iPhone Safari cannot.
- The ₹2,00,00,000 (a station) and ₹4,000 (the unit) figures have no source in the repository yet: do not say them without one.
- The recorded week's GRAP Stage IV days are our estimate for those days, not a record of the official order.
- OpenAQ rejected our key (401) late on 10 October and a new one was put in on 11 October; the stations job then read 7,268 monitors. If it is rejected again, the map's colour comes from the regional air model and says so.
