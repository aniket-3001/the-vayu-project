# Do we walk to school? One answer for one place in Delhi's air, built on AWS

It is 8 am on 21 October 2025, the morning after Diwali, in South Delhi. A child's school bag is by the door. A parent opens a phone and finds an air-quality number for the whole city. The question is small and urgent: do we walk to school today?

The parent is a sketch. The morning is real. The nearest monitor with a fresh reading, Lodhi Road, 3.8 km from a home near R K Puram, read PM2.5 at 980 µg/m³. On the US AQI scale that is 500, the top of the scale. The official pollution stage for all of Delhi-NCR that morning was GRAP Stage II, set from a city-wide average of 351.

The Vayu Project gave that parent one answer: avoid going out. If you must, 4 to 5 pm is the cleanest daylight hour. Wear a well-fitted N95.

![Home on the recorded morning after Diwali: AQI 500, the monitor's name and distance, and advice for this place](images/02b-place-insights-desktop.png)
_The recorded morning after Diwali, 21 Oct 2025, 8 am. The card names the monitor (Lodhi Road, 3.8 km away) and says "as recorded"._

## The idea

Delhi has many air-quality numbers and none of them says what to do. A city figure cannot see one street. The nearest monitor may be kilometres away and its reading hours old.

The Vayu Project is a free web app that turns public air data into a decision for one named place: a home, a school, a park. Walk or stay in. Mask or not. Windows shut or open. Morning assembly inside or on the ground. Every number says which monitor it came from, how far away that monitor is, and how old the reading is.

You can try it now without an account. "Try without login" on https://d3lmq1mze2gup3.cloudfront.net opens seven real past days, played through the same app as if it were 8 am on each: rain, the day after Diwali, stubble fires, two smog days, a downpour that cleared the smog, and a windy day. The air comes from four Delhi monitors in OpenAQ's public archive, cleaned by two written rules that dropped 86 bad hours. The hours after 8 am are what was recorded next, so these days show the features, not forecast accuracy.

I built it solo, for the AWS Environmental Hacks Air track, with Claude as a coding assistant. I chose the problem and the rules, read and ran every change, built the hardware, and deployed it to my own AWS account.

## What you see

You add the places you care about and say who each is for. Each card shows the colour of the air, the AQI, the weather, the cleanest hour, the next two days, and the monitor's name, distance and age. Alerts cover the GRAP band, smog, stubble burning, rain and wind.

Around that sit four more things. A **map** of every monitor the app can read (7,258 on 12 October), satellite fires from NASA, and wind. **Exposure**, which draws a person's day at home, at school or work, and outdoors, coloured by the air. **AIR Lens**, which draws the air as particles in front of your phone camera. And an **assistant** in English and Hindi, by text or voice: "I walked 30 minutes at home" logs a walk.

![Six screens of the app](images/collage-features.jpg)
_Top row: My Air, the recorded morning after Diwali, the map with satellite fires and wind. Bottom row: AIR Lens, the assistant, Exposure._

Three trust rules sit under every screen:

- A reading more than six hours old gives no advice. The card shows an estimate from a regional model and says so.
- Every number is labelled Live, Estimate or Measured.
- A GRAP stage is shown as "the air here is in the GRAP Stage X band". It is my estimate for that place, and the card says the official order comes first. A school is only ever "likely" closed.

That third rule matters because places differ. On 9 November 2025, two places 4 km apart averaged 434 and 319 on India's scale over the previous 24 hours: two different GRAP bands. One city number hides that gap.

## Code decides, AI only words

The assistant is where an air app could do harm, so it has one rule: fixed rules decide the advice, and the model may only reword it.

Amazon Bedrock runs Amazon Nova Micro behind a Guardrail. It gets the rules' answer and the facts behind it. It may reword the answer, or answer a question the rules do not cover from those facts. Then code checks the wording:

- every number must be one of the facts;
- it may not spell numbers out or add reassurance the rules did not write;
- it may not call the air good unless the level is Good;
- masked names such as [place] are put back, whatever their case.

On any doubt, the rules' own plain text goes out. Hindi answers never reach the model: they are fixed wording a person wrote, with the facts slotted in. Amazon Polly, with the neural voice Kajal, reads answers aloud in both languages.

## The room: a measuring unit and a cleaner

Outdoor monitors cannot see inside a room, so I built a small measuring unit: an ESP32-S3 board and a Sensirion SPS30 laser particle sensor. It sends an 18-byte packet every 2 seconds over Bluetooth, and the web app reads it with Web Bluetooth. The room's air appears on My Air beside the air outside. On 11 October the serial monitor showed my room at 18 to 22 µg/m³ PM2.5, and the live site showed the same.

![The measuring unit: an ESP32-S3 board wired to the SPS30 particle sensor on a breadboard](images/build/measuring-unit.jpg)

I have not compared the unit with a monitor, so I do not call it accurate. Bluetooth is tested in Chrome on a Mac only, and iPhone Safari cannot do it.

The room page can show how fast the air falls when a purifier goes on, so I built a prototype cleaner: a free box, a Hicool BCF-250 centrifugal fan (₹3,300), a Smart Air pleated filter (₹1,500) and a foam pre-filter (₹200). ₹5,000 of parts.

![The cleaner built in five steps](images/collage-build.jpg)
_The cleaner in five steps: the box, the fan, the pleated filter, the foam, assembled._

A handheld vane anemometer at the outlet read about 191 cfm, roughly 325 m³ an hour.

[![The anemometer at the cleaner's outlet reading 191 CFM](images/build/purifier-6-airflow-191cfm.jpg)](images/build/airflow-proof.mp4)

That is airflow, not CADR. CADR also depends on how much each pass removes, and is measured by watching a room's particles fall with the cleaner off and then on. I have not run that test, and I have not measured noise or power. It runs on mains power and has had no electrical safety review.

## How it runs on AWS

The app and API are one AWS CDK stack in TypeScript, in Mumbai (ap-south-1). The browser talks only to my API. The API reads public air data (OpenAQ, Open-Meteo, NASA FIRMS), applies the rules and returns one answer with its source and age.

| Service | What it does here, and why |
| --- | --- |
| Amazon CloudFront + Amazon S3 | One address for the app and the API, so no CORS. Private bucket. API answers cached up to 15 minutes. |
| Amazon API Gateway (HTTP API) + AWS Lambda | All routes in one Node 22 function on Graviton. Request and answer checked against a schema, so a bad answer is an error, never a number. 25 requests a second; 3 for the assistant. |
| Amazon DynamoDB | On-demand, with TTL. The cache, saved accounts, cached Polly audio, and the daily quotas. |
| Amazon EventBridge Scheduler | Every 15 minutes, four reference places kept warm. Every 30 minutes, about 7,260 monitors read for the map. Retries off. |
| Amazon Bedrock with Guardrails | Nova Micro rewords; it never decides. One call, 220 tokens at most, 6-second timeout. |
| Amazon Polly | Answers read aloud in English and Hindi. |
| Amazon Cognito | Optional accounts. An API Gateway JWT authorizer guards the one account route. |
| Secrets Manager, Parameter Store, CloudWatch, SNS, X-Ray | Keys out of code; a switch that turns the model off without a deploy; 8 alarms; traces. |

The AWS open source I used is AWS CDK and Powertools for AWS Lambda (Logger and Tracer). CDK assertion tests turn safety rules into failing builds: every Lambda on arm64, no function time limit over 2 minutes, buckets block public access, only the account route behind a token.

One detail I am glad of: the assistant's 500-a-day cap is a single conditional UpdateItem in DynamoDB. It adds one only if there is room, so two requests at the same moment cannot both take the last slot. No lock.

Built and tested but not live: an AWS Step Functions alert loop that waits for a tap, reminds and escalates. Telegram sends are switched off.

### One request, start to finish

1. **CloudFront.** HTTPS only, with HSTS and a strict content policy. For `/v1/*` the cache key is the full query string, and CloudFront forwards one header, `CloudFront-Viewer-Address`, never the viewer's Host header.
2. **Cache hit.** If the API said the answer may be kept, CloudFront returns it in about 0.15 s. An answer without that header, such as an error, is never kept.
3. **API Gateway.** The stage allows 25 requests a second (burst 50). The assistant and speech routes allow 3 a second, forms 1. On `/v1/me` a JWT authorizer checks the Cognito token before any code runs.
4. **Lambda.** It validates the request. For four reference places it reads DynamoDB, filled every 15 minutes. For any other place it fetches OpenAQ and Open-Meteo live: median 1.5 s, p99 5.2 s over the last 24 hours. It drops readings older than six hours, applies the rules and validates the answer.

### Why these services, and not the obvious alternative

- **CloudFront in front of both.** One origin for page and API removes CORS, and the cache turns 1.5 s into 0.15 s. The cost is that if CloudFront fails, nothing loads.
- **HTTP API, not REST API.** I needed a proxy, a throttle and a JWT authorizer, at a lower price per request.
- **One Lambda, not many.** One cold start, one schema contract, one place to test. 256 MB, 10-second limit.
- **DynamoDB, not a cache server.** Nothing to run, and conditional writes give race-free caps.
- **EventBridge Scheduler, not a cron inside Lambda.** The retry policy lives on the schedule. I set it to zero, and an alarm fires after 45 minutes with no runs.
- **Nova Micro, the smallest model.** The job is rewording three sentences. If it fails, the rules answer.
- **Cognito without a hosted page.** Accounts with no auth code of mine in the API.

### The assistant's path, in three details

1. **Switch.** One Systems Manager parameter must read exactly "true"; an error reads as off. The value is cached for 60 seconds, so a flip bites within a minute.
2. **Caps.** One conditional DynamoDB `UpdateItem` per cap: 40 a day per caller (the address hashed with a secret salt) and 500 a day in all. Counters reset at midnight India time.
3. **Bedrock.** One Converse call to `apac.amazon.nova-micro-v1:0` with the Guardrail attached, temperature 0.2, at most 220 output tokens, raced against a 6-second timer.

One honest gap: the number check is a set check. It proves each number came from the facts, not that it sits in the right place. That is why a reworded answer may only use the numbers in its own rule's answer.

## What fought back

### My own screenshot was wrong

Writing this post, I looked at my own screenshot of the morning after Diwali: AQI 500, beside "GRAP Stage II". Those do not go together. The estimate had averaged the last 24 hours the monitor *had*, so gaps pulled in older, cleaner hours. It also stretched one hour's PM10-to-PM2.5 ratio over the whole day.

Now it uses the last 24 hours only, needs 16 of them, caps the ratio at 2, and treats a missing PM10 as a floor. I checked it against the monitors' own PM10 on 24 station-days: 22 landed in the same stage and 2 gave no estimate because too few recent hours were there. The same check found a rain alert that promised clean air when the forecast showed none.

### The model never answered

My first live questions came back in the rules' plain wording, never the model's. The Guardrail's prompt-attack filter was blocking my own rewording instruction, because it sat in the user turn. With the trace off, the response said only that the guardrail had stepped in, not which filter. Moving the instruction to the system prompt fixed it.

### "[Place] has good air quality" at AQI 61

A script that drives the live site in a browser caught a model answer calling Moderate air "good". The model had also capitalised my masked placeholder, so the name was not put back. Placeholders are now restored whatever their case, and an answer that calls the air good when it is not Good is refused. Earlier, my number check had let "[person 1]" through as the number 1. Each of these is now a test.

### A 403 from CloudFront, and a deploy that could not roll back

CloudFront forwarded the viewer's Host header and API Gateway answered 403. An origin request policy that forwards only the viewer address fixed it. My first deploy failed and its rollback failed too: an API stage setting named a route that did not exist yet. It had passed `cdk synth` and every test.

### The sensor went quiet when Bluetooth connected

The serial log showed good readings, then nothing the moment the app connected. The sensor had stopped measuring, most likely from a power dip. The firmware now restarts it on connect and after three failed reads.

## Numbers

- **Cost:** about $4.50 a month idle, worked out from AWS list prices, not read from a bill. An assistant question costs $0.0008, and 98% of that is the guardrail, so the caps sit on the assistant: 40 questions per caller, 500 a day. Everything at its cap, short of a flood, comes to about $46 a month. A flood against CloudFront itself is not capped; there is no WAF.
- **Speed:** a fresh lookup takes a median 1.5 s in Lambda (it fetches live from OpenAQ); a repeat within the cache window comes back from CloudFront in about 0.15 s.
- **Quality:** 1,285 automated tests, plus lint, strict types, `cdk synth` and a bundle check, in one command.

## What is not done

No pilot and no users yet, so I claim nothing about health. The GRAP band is my estimate, checked against monitors, not against official orders. The unit's accuracy is untested and the cleaner's CADR is unmeasured.

## What is next

First, the smoke-decay test: raise a room's PM2.5, log how fast it falls with the cleaner off and then on, and fit the curve. Then the unit beside a monitor for a few days, with the difference published. Then one school, for one term.

## What I learned

Keep the model's job small: every failure I had with it sat where that line was loose. Read your own screenshots as a stranger would: a number can be right and the sentence beside it wrong. And say plainly what you did not measure. It changed what I let the app claim.

Try it: https://d3lmq1mze2gup3.cloudfront.net · Seven recorded days: https://d3lmq1mze2gup3.cloudfront.net/#/week · Code: https://github.com/hrsh-kr/the-vayu-project
