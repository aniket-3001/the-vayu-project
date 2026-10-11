# Submission pack

Words for the hackathon form and the video. Everything here matches `docs/AS-BUILT.md`; where the two differ, that page is right.
Lines marked **(confirm)** are for the team to check or fill before sending.

## Project description (short)

Vayu Air is a free app that turns public air-quality data into a daily decision for a Delhi family, school or society:
is it a good time for a walk, is school safe, do we need a mask, are the windows better shut.
It shows the air at the places you set (home, school, work, a park), what a person breathed over the day (Exposure),
a world map of monitors, wind, fires and the colour between them, and an AIR Lens that turns a number into particles
in front of the camera. Alerts for the next three days follow the GRAP stages, smog, stubble burning, rain and wind, and
the Insights for a place say what that means for a school's assembly or a walk in a park.

Every number says whether it is **Live** (a named monitor, how far, how old) or an **Estimate** (a regional model).
Nothing is advised from a reading older than six hours. The app's own monitor and purifier are **not built**: the
Devices screen says "To be implemented" and nothing is counted from a device.

Live: https://d3lmq1mze2gup3.cloudfront.net

## How it uses AWS

CloudFront and S3 serve the app; API Gateway and a Lambda serve `/v1`; DynamoDB caches and holds quotas; EventBridge
Scheduler runs the harvest and the map's monitor job so visitors never call a provider; Bedrock (Amazon Nova Micro, with
a guardrail) only rewords answers that fixed rules already decided; Polly reads answers aloud; Step Functions run the
alert loop and "did it work?"; Secrets Manager, an SSM kill switch, throttles and daily caps keep it safe and cheap;
everything is CDK in TypeScript. See `docs/architecture.md`, `docs/cost.md` and `docs/safety.md`.

## Video script (about four minutes)

| Time      | Show                                                                                                                                                                                                                                                   | Say                                                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:30 | A hazy Delhi morning; a parent checking the air; the app's My Air                                                                                                                                                                                      | The problem: the numbers exist but nobody can act on them; one monitor is kilometres from your child's school. The solution: Vayu Air, one clear answer for each place you care about, and a ₹4,000 unit that measures the room itself.                                  |
| 0:30–1:30 | Phone, the deployed app: add Home, School and Work; the live location card; set who each place is for; read a card's fields                                                                                                                            | How to set it up the first time, and what each field means: the AQI and its level, the 3-day strip, where the number came from (a named monitor, how far, how old), the GRAP pill, the assembly line.                                                                    |
| 1:30–2:10 | The unit on a desk; Devices tab; Connect over Bluetooth; the live reading; room against outside; Exposure counting the hour                                                                                                                            | The unit (ESP32 and a laser particle sensor, about ₹4,000) streams to the phone. The reading is set beside the nearest monitor's, and the hours spent there count in Exposure as measured. For the price of one monitoring station, thousands of these: hyperlocal data. |
| 2:10–3:10 | The **recorded week** (open `/#/week` on the deployed site): seven real days, one chip each. 6 Oct 2025 rain (the air clears); 7 Oct the clean day after; 21 Oct after Diwali; 31 Oct stubble fires (the alert, the fire map); 12 Nov smog; 22 Dec GRAP Stage IV by our estimate (school likely closed); 30 Mar wind. Show tips, alerts, the map and Exposure on each | These are real days from the OpenAQ archive, NASA's fire detections and the weather record, played through the same app. The stage is our own unofficial estimate, never the order. |
| 3:10–4:00 | An **animated architecture diagram**: phone to CloudFront to API Gateway to Lambda, the scheduled jobs, DynamoDB, Bedrock with its guardrail, Polly, the kill switch and caps                                                                          | How the data flows, and how permissions and guardrails hold: the model only words answers the rules decided, every number is checked, daily caps and a kill switch, secrets in Secrets Manager.                                                                          |

The recorded week is built (`apps/web/src/week`, data made by `scripts/record-week.mjs`, see `docs/AS-BUILT.md`), and so
is the animated architecture diagram: open `docs/architecture-animated.html` in a browser (five scenes; Space plays or
pauses, arrow keys step, `#step=3` holds on a scene).

## What each person did **(confirm)**

- Software: the app, the API and the AWS stack were written with an AI coding assistant (Claude Code), directed and
  reviewed by the team. Every change goes through `make prove` (lint, types, tests, `cdk synth`, bundle check).
- Device design and the claims about it: documented in `DEVICE.md`; not built, so nothing is measured or claimed.
- Names and roles for the form: **(confirm)**

## AI tools used

- Claude Code: writing and testing the code and the documents.
- Amazon Bedrock, Nova Micro, with a guardrail: rewording the assistant's answers at run time. It has no tools and
  cannot act. See `docs/AGENT-BOUNDARIES.md`.

## Feedback on AWS **(confirm and edit)**

Things we hit, in the order we hit them:

- CloudFront forwarding the viewer's `Host` header to API Gateway gives a 403; the origin request policy has to leave it out.
- The Bedrock guardrail's prompt-attack filter blocks instructions placed in the user turn. Putting the rewording
  instruction in the system prompt works.
- `cdk deploy` behind a corporate network needs the system certificate store (`NODE_OPTIONS=--use-system-ca`).
- Scheduled jobs that call a provider need their own time budget inside the function's time limit, and a schedule that
  never runs needs its own alarm; neither is a default.
- Lambda egress addresses differ from a laptop's, which is why the wind and air model are asked from the API once for
  everyone rather than from each browser.

## Honest limits

- No hardware has been built or measured. Rules I13 and I16 apply to it and are untested on a device.
- Telegram alerts are built and tested against fakes; live scheduled sends are off and there is no in-app screen to link a chat.
- OpenAQ rejected our key (401) late on 10 October and a new one was put in on 11 October; the stations job then read 7,268 monitors. If it is rejected again, the map's colour comes from the regional air model and says so.
