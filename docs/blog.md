# One clear answer for the air at the places you care about

_A draft for me to edit into my own words, then publish on AWS Builder Center. Numbers are from this repository; the links go to the files that prove them._

Delhi's air has plenty of numbers. What a parent lacks at seven in the morning is an answer: should the assembly be indoors, is a walk worth it, do we shut the windows. One city-wide AQI does not say. The nearest monitor may be kilometres from the school, and the reading may be hours old.

Vayu Air is a free web app that gives one answer for each place you care about, and says where the answer came from. Add Home, a school, an office or a park, and each card shows the air now, the weather, the nearest monitor's name, how far it is and how old the reading is, and what to do about it. A small measuring unit adds the air in your own room.

## It is all real data

The live app reads real monitors (OpenAQ), real weather, forecast and wind (Open-Meteo, with MET Norway as a second source for wind) and real satellite fires (NASA FIRMS), through our own API on AWS. There is no demo mode. To show every feature without waiting for a bad day, the app also plays a **recorded week**: seven real days, from a rainy day in October to the smog of December and a windy day in March, played through the very same app as if each were today at 8 am. The air for those days is from four Delhi monitors in OpenAQ's public archive; the weather and the fires are archives too. The page says it is recorded. When the archive had a 999 (the feed's "out of range") or one monitor spiking alone, two written rules dropped it and the file counts how many (81); nothing else was changed.

## What it is not

It is not an official source. A GRAP stage in the app is **our estimate** from the last 24 hours, and every line that mentions one says the official order comes first. It does not say a school is closed; it says "likely closed", and points to the school's notice. It is not a medical tool. And the little unit is not a reference instrument.

## The rule that holds it together: code decides, AI only words

The assistant answers questions like "When can I walk today?" in English or Hindi. Fixed rules decide the answer from the readings. Amazon Bedrock (Nova Micro, behind a guardrail) may reword it, and then every number in the wording is compared with the facts: a number that is not there sends the plain wording instead. A Hindi answer never goes to the model at all; it is wording a person wrote, with the facts slotted in. The model has no tools and cannot act. [`docs/safety.md`](safety.md) lists each rule, where the code enforces it and the test that fails if it breaks.

The same stance runs through the data. A monitor reading older than six hours is dropped, and with none left the answer is labelled an **Estimate** from a regional model, with no advice. Every number carries its source and age; the smoke test fails a live answer without them.

## The unit

An ESP32-S3 and a Sensirion SPS30 laser particle sensor, wired over UART, send one 18-byte packet every two seconds over Bluetooth Low Energy. The web app connects with Web Bluetooth (Chrome on a computer or Android) and shows the room as a card, first after "Add a place": the live AQI and a line of the last minutes. Open it and the room's air is drawn against the air outside at your place as two lines, so the gap is what a closed window or a purifier is doing. Press "Purifier on", and the line is marked and the app says how far the room's PM2.5 fell and how long it took to halve. The hours the unit measured count in Exposure in place of the outside reading at the address, and an hour without enough readings is not made up.

What we have not done: compared it with a monitor over days. So it is called a low-cost sensor, shown beside the nearest monitor, and never "scientific-grade". The purifier is not built either; its card is a sample with a "To be implemented" banner. [`docs/claims.md`](claims.md) lists what we say and what we do not.

## Why these AWS services

| Service                             | Why it is there                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| CloudFront and S3                   | One address for the page and the API; a private bucket; security headers             |
| API Gateway and Lambda              | Every route checks its request and its answer against a contract                     |
| DynamoDB                            | The cache the scheduled jobs fill, quotas and requests, with items that expire       |
| EventBridge Scheduler               | The harvest and the map's monitors run on a clock, so visitors never call a provider |
| Bedrock with a guardrail, and Polly | Wording and voice, never decisions                                                   |
| Step Functions                      | The alert loop waits for a tap, reminds, escalates; every task has a time limit      |
| Secrets Manager and an SSM switch   | No key in code; the assistant can be switched off in one command                     |
| CDK                                 | The whole stack, with tests that the caps and permissions exist                      |

Idle, the stack costs about $4.50 a month; an assistant question costs about $0.0008; and every metered thing has a daily cap ([`docs/cost.md`](cost.md)). Not capped: a flood against CloudFront itself.

## What fought back

- **403 behind CloudFront.** The viewer's `Host` header was forwarded to API Gateway. The fix was to forward only the viewer address.
- **The model never answered.** Bedrock's guardrail blocked our own rewording instruction because it sat in the user turn. In the system prompt it passes.
- **A name counted as a number.** The number check let a masked `[person 1]` through as the allowed figure 1. It no longer counts.
- **The map's wind ran out.** Open-Meteo counts each point of a many-point request as a call against the address's daily allowance. The API now asks once for everyone, keeps the answer, falls back to MET Norway, and retries no sooner than ten minutes after a refusal.
- **The key was rejected.** OpenAQ answered 401 late on the last night. A new key went into Secrets Manager and the stations job read 7,268 monitors. If it happens again the map is coloured by the regional model and says so.
- **The sensor stopped answering the moment the app connected.** The serial log showed readings, then "No more data in frame" as soon as Bluetooth connected, most likely a power dip. The firmware now restarts the sensor on connect and after three failed reads.

The whole list is in [`docs/learning-log.md`](learning-log.md).

## Numbers

1,243 tests pass in one command with lint, types, `cdk synth` and a check that the deployed bundle holds no prototype code (`make prove`). The code was written with Claude Code, directed and reviewed by me; I wired, flashed and tested the unit on my desk.

## What is next

Put the unit beside a monitor for a few days and publish the difference. Build the purifier and measure its air-delivery rate, rather than quote one. Turn on scheduled Telegram alerts and add a screen to link a chat. Move the unit's readings to our API so a school can see many rooms.

Live: https://d3lmq1mze2gup3.cloudfront.net · The recorded week: https://d3lmq1mze2gup3.cloudfront.net/#/week
