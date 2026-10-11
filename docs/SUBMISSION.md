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

## Two-minute video script

| Time | Show                                              | Say                                                                                                                                                                                                  |
| ---- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | My Air with four place cards                      | "Delhi's air decides whether a child plays outside. Vayu Air gives each family one clear answer per place."                                                                                          |
| 0:12 | Press a card; the Insights on the place page      | "Each place says where its number came from, how far the monitor is and how old it is. Insights follow the GRAP guidance: at Stage IV the school is likely closed, so there is no assembly to plan." |
| 0:30 | Open the GRAP alert, then the rain alert          | "Alerts are plain in the list and open into a scene. Rain only appears above a sixty percent chance."                                                                                                |
| 0:45 | Exposure: lines, the total-day bar, log an outing | "Exposure adds up the air a person breathed, hour by hour: home, school, outdoors, and what you log."                                                                                                |
| 1:05 | Map: colour, borders, wind, a fire, report it     | "The map shows every monitor, real wind from the weather models, and the satellite fires. A fire can be reported for a person to read; it is not sent to any agency."                                |
| 1:25 | AIR Lens, the 36-hour play button                 | "Point the camera and the number becomes particles. Slide through the next thirty-six hours."                                                                                                        |
| 1:40 | Assistant: ask, hear the answer                   | "Rules decide the answer. The AI model only words it, and every number is checked against the facts."                                                                                                |
| 1:52 | Devices: "To be implemented"                      | "Our own monitor and purifier are not built yet, and the app says so."                                                                                                                               |

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
