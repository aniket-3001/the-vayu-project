# Submission pack

Words for the hackathon form and the video. Everything here matches `docs/AS-BUILT.md`; where the two differ, that page is right.
Lines marked **(confirm)** are for me to check or fill before sending.

## Project description (short)

The Vayu Project is a free app that turns public air-quality data into a daily decision for a Delhi family, school or society:
is it a good time for a walk, is school safe, do we need a mask, are the windows better shut.
It shows the air at the places you set (home, school, work, a park), what a person breathed over the day (Exposure),
a world map of monitors, wind, fires and the colour between them, and an AIR Lens that turns a number into particles
in front of the camera. Alerts for the next three days follow the GRAP stages, smog, stubble burning, rain and wind, and
the Insights for a place say what that means for a school's assembly or a walk in a park.

Every number says whether it is **Live** (a named monitor, how far, how old) or an **Estimate** (a regional model).
Nothing is advised from a reading older than six hours. A small measuring unit (ESP32-S3 and an SPS30 laser particle sensor)
connects over Bluetooth and becomes a "Your room" card: the room's live air against the air outside, with the hours it
measured counted in Exposure. A prototype air cleaner (a fan, a filter and a foam pre-filter in a box) is built and its outlet airflow measured at about 191 cfm; its CADR is not measured, it does not switch by itself.

**It is all real data.** The live app reads real monitors, weather and satellite fires. The recorded days (`/#/week`) is seven
real days from the public archives played through the same app, labelled recorded. The only made-up days are in a separate
prototype build that is never uploaded.

Live: https://d3lmq1mze2gup3.cloudfront.net

## How it uses AWS

CloudFront and S3 serve the app; API Gateway and a Lambda serve `/v1`; DynamoDB caches and holds quotas; EventBridge
Scheduler runs the harvest and the map's monitor job so visitors never call a provider; Bedrock (Amazon Nova Micro, with
a guardrail) only rewords answers that fixed rules already decided; Polly reads answers aloud; Step Functions run the
alert loop and "did it work?"; Secrets Manager, an SSM kill switch, throttles and daily caps keep it safe and cheap;
everything is CDK in TypeScript. See `docs/architecture.md`, `docs/cost.md` and `docs/safety.md`.

## Video script (3 minutes at most)

About 330 spoken words: roughly two and a half minutes at an easy pace, which leaves room for pauses under the 3-minute limit. Record the screen, then read the lines over it.

| Time        | Show                                                                                                                                                                                                    | Say                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 – 0:20 | The recorded morning after Diwali, 21 Oct, on a place page (AQI 500, the monitor's name and "as recorded")                                                                                              | "It is the morning after Diwali in Delhi, 8 am. The city app says bad. A parent still has to decide: do we walk to school? The Vayu Project gives one answer for one place, from the nearest monitor, with its name, its distance and the age of the reading."                                                                                                                                                                    |
| 0:20 – 0:55 | The live site on a phone, no places set: add a place by search, the card appears, open it. Point at the monitor line, the GRAP alert, the cleanest hour                                                 | "You add a place by search or by your location. The card shows the air, the weather and what to do. Open it: the monitor is named and its distance shown. The alert says GRAP Stage IV is likely. That is our estimate from the last 24 hours, never the official order."                                                                                                                                                         |
| 0:55 – 1:25 | Tap "See the recorded days" (new tab). 21 Oct, then 31 Oct and the map with fires and wind, then 9 Nov                                                                                                  | "One button opens the recorded days: seven real days from public archives, played through the same app. Here is the stubble-burning day: satellite fires, the wind, the alert. Nothing is made up, and every screen says recorded."                                                                                                                                                                                               |
| 1:25 – 1:55 | The unit on the desk, Add device, Connect, the room against the outside air. Then the cleaner collage (`docs/images/collage-build.jpg`) and the anemometer clip (`docs/images/build/airflow-proof.mp4`) | "A city number cannot see your room. So I built a measuring unit, an ESP32 and a laser particle sensor, that sends to the phone over Bluetooth. I also built a cleaner: a fan, a filter and foam in a box. The parts cost five thousand rupees. I measured its airflow, not its CADR. For scale, a Dyson HushJet Purifier Compact launched in India at 29,900 rupees: a price, not a performance claim."                          |
| 1:55 – 2:40 | The animated architecture diagram, scenes 1 to 5 (`docs/architecture-animated.html`)                                                                                                                    | "One CDK stack in Mumbai. CloudFront and S3 serve the app. API Gateway and Lambda answer. Scheduled jobs on EventBridge fill DynamoDB, so visitors never call the air providers. Bedrock, Nova Micro, behind a guardrail, may reword an answer, and every number in it is checked against the facts, or the rules' own text goes out. Polly reads it aloud. Caps and a kill switch keep it near four dollars fifty a month idle." |
| 2:40 – 2:55 | The learning log row, or the 22 Dec place page                                                                                                                                                          | "What I learned: my own screenshot showed AQI 500 next to Stage II. The estimate had used the wrong 24 hours. It is fixed, and checked against the monitors' own PM10. The Vayu Project, live at the address on screen."                                                                                                                                                                                                          |

Notes before recording:

- Use a fresh browser profile, so My Air is empty and the "See the recorded days" button shows. Phone width, 390 px.
- The assistant has a per-caller daily cap (40 questions) and answers from its own rules once it is reached. Leave it out of the video, or record after the cap resets at 05:30 IST.
- Price of the cleaner: say "parts", and that a cable, plug and switch are not itemised. If you set it beside the Dyson HushJet Purifier Compact (₹29,900 at the India launch), say only that it is a price, and that Dyson's number is a published CADR while ours is airflow; follow `docs/COMPARISON.md`.
- Do not say what the unit costs, or what a station costs, unless you can show the bill or a source (`docs/claims.md`).
- Telegram alerts are built and tested against fakes, and live sends are off. Leave them out.
- Bluetooth was tested in Chrome on a Mac only.

The recorded days is built (`apps/web/src/week`, data made by `scripts/record-week.mjs`, see `docs/AS-BUILT.md`), and so
is the animated architecture diagram: open `docs/architecture-animated.html` in a browser (five scenes; Space plays or
pauses, arrow keys step, `#step=3` holds on a scene).

## What each person did **(confirm)**

I built this alone (`CONTRIBUTIONS.md`). Every change goes through `make prove` (lint, types, tests, `cdk synth`,
bundle check). I designed, wired, flashed and tested the measuring unit myself.

## AI services in the app

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
- The GRAP stages in the recorded days are our estimate for those days, not a record of the official order. The estimate is the last 24 hours' average AQI on India's scale, checked against the monitors' own PM10 (no day in the wrong stage on 24 station-days); an hour can be worse than the day's average and the app says so.
- OpenAQ rejected our key (401) late on 10 October and a new one was put in on 11 October; the stations job then read 7,268 monitors. If it is rejected again, the map's colour comes from the regional air model and says so.
