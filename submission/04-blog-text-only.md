# Do we walk to school today? One answer for one place in Delhi's air, built on AWS

It is 8 am on 21 October 2025, the morning after Diwali, in South Delhi. A school bag sits by the door. A parent opens a phone and finds one air-quality number for the whole city. The question is small and urgent: do we walk to school?

The parent is a sketch. The morning is real. The nearest monitor with a fresh reading, Lodhi Road, 3.8 km from a home near R K Puram, read PM2.5 at 980 µg/m³. On the US Air Quality Index (AQI) that is 500, the top of the scale. The official pollution stage for all of Delhi-NCR that morning was GRAP Stage II, set from a city-wide average of 351. GRAP is Delhi's Graded Response Action Plan.

Replayed at 8 am, The Vayu Project says: avoid going out, and wear a well-fitted N95 if you must. It names the monitor, its distance and the reading's age.

_(Image: Home on the recorded morning after Diwali: AQI 500, PM2.5 980 µg/m³, the Lodhi Road monitor at 3.8 km "as recorded", and the advice for this place)_

It is free and live: https://d3lmq1mze2gup3.cloudfront.net. Press **Try without login** to play that morning yourself.

## The idea

Delhi has many air-quality numbers and none of them says what to do. A city figure cannot see one street. The nearest monitor may be kilometres away and its reading hours old.

The Vayu Project turns public air data into a decision for one named place: a home, a school, a park. Walk or stay in. Mask or not. Windows shut or open. School assembly inside or on the ground. Every number says which monitor it came from, how far away it is and how old the reading is.

I built it solo for the AWS Environmental Hacks Air track, with Claude as a coding assistant. I chose the problem and the rules, read and ran every change, built the hardware, and deployed everything to my own AWS account.

_(Image: Six screens of the app: My Air, the recorded days, the map, AIR Lens, the assistant and Exposure)_

## What you get

You add the places you care about. Each card shows the colour of the air, the AQI, the weather, the cleanest hour, the next two days, and the monitor's name, distance and age. Alerts cover the GRAP band, smog, stubble burning, rain and wind. Around the cards sit a map of every monitor the app can read (7,258 on 12 October), an Exposure view of a person's day, AIR Lens, which draws the air as particles in front of your camera, and an assistant in English and Hindi, by text or voice.

Three trust rules sit under every screen:

- **Old readings give no advice.** A reading more than six hours old is dropped, and the card shows an estimate from a regional model and says so.
- **Every number is labelled** Live, Estimate or Measured.
- **A GRAP stage is my estimate, never an order.** The card says "the air here is in the Stage X band", and the official order comes first. A school is only ever "likely" closed.

The third rule matters because places differ. On 9 November 2025, two places 4 km apart averaged 434 and 319 on India's scale over the previous 24 hours: two different GRAP bands. One city number hides that gap.

### Seven real days, no waiting for a bad one

**Try without login** plays seven real past days through the same app, as if it were 8 am on each:

- **7 Oct 2025:** rain, and the cleanest of the seven.
- **21 Oct:** the morning after Diwali, AQI 500 at the nearest monitor.
- **31 Oct:** the stubble-burning peak, with satellite fires upwind.
- **9 Nov and 22 Dec:** two smog days.
- **23 Jan 2026:** heavy rain clears the smog overnight.
- **30 Mar 2026:** a windy day.

The air comes from four Delhi monitors in OpenAQ's public archive, the weather from Open-Meteo's archive and the fires from NASA FIRMS. Two written rules clean it: impossible values are dropped, and so is one monitor's hour that reads over three times the median of the others. The 86 hours dropped as lone-monitor spikes are counted in the file. The hours after 8 am are what was recorded next, so the days show the features, not forecast accuracy.

_(Image: The map on 31 October 2025: NASA satellite fire detections over Punjab and Haryana, with wind arrows)_

## Code decides, AI only words

An air app can do harm in its assistant, so it follows one rule: fixed rules decide the advice, and the model may only word it.

Amazon Bedrock runs Amazon Nova Micro behind a Guardrail. It gets the rules' answer and the facts behind it. It may reword the answer, or answer a question the rules do not cover from those facts. Then code checks the wording:

- every number must be one of the facts;
- it may not spell numbers out or add reassurance the rules did not write;
- it may not call the air good unless the level is Good;
- masked names such as `[place]` are put back, in any case.

On any doubt, the rules' own text goes out. Hindi answers never reach the model: they are wording a person wrote, with the facts slotted in. Amazon Polly, with the neural voice Kajal, reads answers aloud in both languages.

_(Image: The assistant's answer on 9 Nov 2025: Stage III band likely at Home, the cleanest hour, and a mask, labelled "Wording by AI, checked against the facts")_

One honest gap: the number check is a set check. It proves each number came from the facts, not that it sits in the right place. That is why a reworded answer may only use the numbers in its own rule's answer.

## How it runs on AWS

The app and API are one AWS CDK stack in TypeScript, in Mumbai (ap-south-1). The browser never calls an air-data provider: readings, forecasts and fires come through my API. Only place search, map tiles and Cognito sign-in are called directly. The API reads public data (OpenAQ, Open-Meteo, NASA FIRMS), applies the rules and returns one answer with its source and age.

_(Image: The request path: the phone asks CloudFront, which passes /v1 to API Gateway and one Lambda, backed by DynamoDB)_

| Service                                                  | What it does here, and why                                                                                                                                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amazon CloudFront + Amazon S3                            | One address for the app and the API, so no CORS. The bucket is private. The API says how long an answer may be kept, up to 15 minutes; an answer without that header, such as an error, is never kept.                      |
| Amazon API Gateway (HTTP API)                            | A proxy, a throttle and a JWT authorizer, cheaper per request than a REST API. 25 requests a second (burst 50); 3 for the assistant and speech; 1 for forms.                                                                |
| AWS Lambda                                               | One function for every route (Node 22, Graviton, 256 MB, 10-second limit). It checks each request and answer against a schema, so a bad answer is an error, never a number.                                                 |
| Amazon DynamoDB                                          | On-demand, with TTL. The cache, saved accounts, cached speech and the daily caps. Each cap is one conditional `UpdateItem`: add one only if there is room, so two requests at once cannot both take the last slot. No lock. |
| Amazon EventBridge Scheduler                             | Every 15 minutes, four reference places kept warm. Every 30, about 7,260 monitors read for the map. Retries are zero, and an alarm fires if a job stops: after 45 minutes for the first, 90 for the second.                 |
| Amazon Bedrock with Guardrails                           | Nova Micro rewords; it never decides. One Converse call, temperature 0.2, 220 tokens at most, raced against a 6-second timer.                                                                                               |
| Amazon Polly                                             | Answers read aloud, cached by their text.                                                                                                                                                                                   |
| Amazon Cognito                                           | Optional accounts. A JWT authorizer guards the one account route, and saved data is keyed by the user id inside the verified token.                                                                                         |
| Secrets Manager, Parameter Store, CloudWatch, SNS, X-Ray | Keys out of code; one parameter that switches the model off within a minute, with no deploy; 8 alarms; a trace of every AWS call.                                                                                           |

The AWS open source I used is AWS CDK and Powertools for AWS Lambda (Logger and Tracer). CDK assertion tests turn safety rules into failing builds: every Lambda on arm64, no function time limit over 2 minutes, buckets block public access, and only the account route behind a token.

Also deployed and tested, with its sends switched off: an AWS Step Functions alert loop that waits for a tap. Nothing in the app starts it yet. The whole repository runs 1,285 automated tests, plus lint, types and `cdk synth`, in one command.

## The room: a measuring unit and a cleaner

Outdoor monitors cannot see inside a room, so I built a small measuring unit: an ESP32-S3 board and a Sensirion SPS30 laser particle sensor. It sends an 18-byte packet every 2 seconds over Bluetooth, and the web app reads it with Web Bluetooth. The room's air appears on My Air beside the air outside. On 11 October the serial monitor showed my room at 18 to 22 µg/m³ PM2.5, and the live site showed the same.

_(Image: The measuring unit: an ESP32-S3 board wired to the SPS30 particle sensor on a breadboard)_

I have not compared the unit with a monitor, so I do not call it accurate. Bluetooth is tested in Chrome on a Mac only; iPhone Safari cannot do it.

The room page can show how fast the air clears when a purifier goes on, so I built a prototype cleaner: a free box, a Hicool BCF-250 centrifugal fan (₹3,300), a Smart Air pleated filter (₹1,500) and a foam pre-filter (₹200). ₹5,000 of parts.

_(Image: The cleaner built in five steps: the box, the fan, the pleated filter, the foam, assembled)_

A handheld vane anemometer at the outlet read about 191 cfm, roughly 325 m³ an hour.

_(Image: The anemometer at the cleaner's outlet reading 191 CFM)_

That is airflow, not CADR. CADR also depends on how much each pass removes, and is measured by watching a room's particles fall with the cleaner off and then on. I have not run that test, or measured noise or power. It runs on mains power and has had no electrical safety review.

## What fought back

### My own screenshot was wrong

Writing this post, I looked at my screenshot of the morning after Diwali: AQI 500, beside "GRAP Stage II". Those do not go together. The estimate had averaged the last 24 hours the monitor _had_, so gaps pulled in older, cleaner hours. It also stretched one hour's PM10-to-PM2.5 ratio over the whole day.

Now it uses the last 24 hours only, needs 16 of them, caps the ratio at 2, and treats a missing PM10 as a floor. I checked it against the monitors' own PM10 on 24 station-days: 22 landed in the same stage and 2 gave no estimate because too few recent hours were there.

### The model never answered

My first live questions came back in the rules' plain wording, never the model's. The Guardrail's prompt-attack filter was blocking my own rewording instruction, because it sat in the user turn. With the trace off, the response said only that the guardrail had stepped in, not which filter. Moving the instruction to the system prompt fixed it.

### "Good air quality" at AQI 61

A script that drives the live site caught a model answer calling Moderate air "good", and a masked place name that was never put back. Both are now refused or restored, and each is a test. Earlier, my number check had let "[person 1]" through as the number 1.

### A 403 from CloudFront, and a deploy that could not roll back

CloudFront forwarded the viewer's Host header and API Gateway answered 403. An origin request policy that forwards only the viewer address fixed it. My first deploy failed and its rollback failed too: an API stage setting named a route that did not exist yet. It had passed `cdk synth` and every test.

### The sensor went quiet when Bluetooth connected

The serial log showed good readings, then nothing the moment the app connected. The sensor had stopped measuring, most likely from a power dip. The firmware now restarts it on connect and after three failed reads.

## Numbers

- **Cost:** about $4.50 a month idle, worked out from AWS list prices, not read from a bill. An assistant question costs $0.0008, and 98% of that is the guardrail, so the caps sit on the assistant. Everything at its cap comes to about $46 a month. A flood against CloudFront itself is not capped; there is no WAF.
- **Speed:** over 24 hours the API's Lambda took a median 1.5 s and 5.2 s at p99 (a place it has not seen is fetched live from OpenAQ). I saw 1.6 to 7.3 s end to end on a fresh lookup, including one cold start. A repeat comes back from CloudFront in about 0.15 s.

## What is not done, and what is next

No pilot and no users yet, so I claim nothing about health. The GRAP band is my estimate, checked against monitors, not against official orders. The unit's accuracy is untested and the cleaner's CADR is unmeasured.

Next: the smoke-decay test (raise a room's PM2.5, log how fast it falls with the cleaner off and then on, and fit the curve, accepting it only above R² 0.95). Then the unit beside a monitor for a few days, with the difference published. Then one school, for one term.

## What I learned

Keep the model's job small: every failure I had with it sat where that line was loose. Read your own screenshots as a stranger would: a number can be right and the sentence beside it wrong. And say plainly what you did not measure. It changed what I let the app claim.

Try it: https://d3lmq1mze2gup3.cloudfront.net · Seven recorded days: https://d3lmq1mze2gup3.cloudfront.net/#/week · Code: https://github.com/hrsh-kr/the-vayu-project
