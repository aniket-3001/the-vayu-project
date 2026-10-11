# What it costs to run

Region: Asia Pacific (Mumbai), `ap-south-1`. CloudFront is priced at its India rate.
Every price below was read from the AWS Price List API on 10 October 2026 (the `ap-south-1` and `aws-other` price files for each service). Nothing is rounded in our favour.
The tokens, durations and text units are measured from the deployed app, not assumed.

All figures are list prices in US dollars, before any free tier. The always-free allowances (for example Lambda's 1 million requests and 400,000 GB-seconds a month) would take most of the compute lines to zero. They are left out so the figures hold in any account.

## The prices used

| Service                             | Price                                                                           | Unit                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Lambda                              | $0.20 per million requests; $0.0000166667                                       | request; GB-second (x86 rate; the functions run on arm64, which is cheaper, so these sums are an upper bound) |
| API Gateway (HTTP API)              | $0.00000105                                                                     | request                                                                                                       |
| DynamoDB on demand                  | $0.00000071 write; $0.0000001425 read; $0.285                                   | write unit; read unit; GB-month (first 25 GB free)                                                            |
| CloudFront (India)                  | $0.109 first 10 TB; $0.0000012                                                  | GB out; HTTPS request                                                                                         |
| S3                                  | $0.025                                                                          | GB-month                                                                                                      |
| Secrets Manager                     | $0.40; $0.000005                                                                | secret a month; API request                                                                                   |
| CloudWatch                          | $0.10; $0.67                                                                    | alarm a month; GB of logs ingested                                                                            |
| Step Functions (Standard)           | $0.0000285                                                                      | state transition                                                                                              |
| EventBridge Scheduler               | free for the first 14 million; $0.00000105 after                                | invocation                                                                                                    |
| Bedrock, Amazon Nova Micro (Mumbai) | $0.000041 input; $0.000164 output                                               | 1,000 tokens                                                                                                  |
| Bedrock Guardrails                  | $0.00015 content filters; $0.00015 denied topics; $0.0001 sensitive information | text unit (up to 1,000 characters)                                                                            |

## Cost of one thing

| One…                                           | Costs                                    | How                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **assistant question**                         | **$0.00081** (at most $0.00085)          | A reworded answer is about 143 tokens in and 37 out ($0.000012). The guardrail checks the question and the answer, 1 text unit each, 3 filters each: 2 × $0.0004 = $0.0008. The guardrail is 98% of the cost. The worst case the token limit allows, 300 in and 220 out, adds only $0.00004. Measured on the deployed guardrail on 10 Oct.                              |
| **answer read aloud** (Polly Kajal)            | **$0.0026** on average (at most $0.0064) | About 160 characters is $0.0026; the longest allowed, 400, is $0.0064. The same words spoken again within a day cost nothing: the audio is kept in DynamoDB. The daily caps are 12,000 characters a caller (about 50 answers) and 60,000 in all, at most $0.96 a day. Measured: Polly's neural voice is priced per character, so cost follows the length of the answer. |
| **visit** (first load plus about 12 API calls) | **$0.00014** at most                     | About 0.8 MB out of CloudFront ($0.00009), 20 CloudFront requests ($0.000024), and 12 API calls that all miss the cache, each $0.0000028 ($0.000034). A repeat visit costs less: the page files are kept for a year and the API answers for up to 5 to 15 minutes.                                                                                                      |
| **API call that misses the cache**             | $0.0000028                               | API Gateway $0.00000105; Lambda about 0.2 seconds at 256 MB plus its request fee $0.00000083 and $0.0000002; 5 DynamoDB reads $0.0000007.                                                                                                                                                                                                                               |
| **request-form submission**                    | $0.0000033                               | One API call, one Lambda run, two small writes.                                                                                                                                                                                                                                                                                                                         |
| **place's answer, from the shared cache**      | $0.0000012                               | One CloudFront request. A hit costs no API or Lambda at all.                                                                                                                                                                                                                                                                                                            |
| **Telegram alert** (when switched on)          | about $0.00017                           | About 6 Step Functions transitions. Telegram is free. Sends are off.                                                                                                                                                                                                                                                                                                    |

## What it costs with nobody using it

| Line                         | A month        | How                                                                                                                                       |
| ---------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets (5)                  | $2.00          | The OpenAQ key, the FIRMS map key, the Telegram bot token, the webhook secret, the request salt.                                          |
| Alarms (8)                   | $0.80          | One for each thing that can quietly stop.                                                                                                 |
| Harvest (96 runs a day)      | $0.19          | 2,880 runs, measured average 15.6 seconds, 256 MB.                                                                                        |
| Map monitors (48 runs a day) | $0.54          | 1,440 runs, up to about 90 seconds, 256 MB.                                                                                               |
| Scheduler                    | $0             | 4,320 invocations, inside the free 14 million.                                                                                            |
| Tables, bucket, logs         | under $1       | A few thousand small writes, a few MB of files, and logs. The log volume is not measured; $0.67 is the price of a whole gigabyte a month. |
| **Total**                    | **about $4.5** | And the free tier takes the two Lambda lines to zero.                                                                                     |

## What the limits allow

These are the most each limit lets the app spend, which is the point of having them.

| Limit                                                                           | Allows at most                                            | Calculation                                                                                                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Assistant: 500 questions a day for the whole service (40 a caller)              | **$0.42 a day, about $12.70 a month**                     | 500 × $0.00085. The earlier limit of 1,500 would have been up to $38 a month, most of the $50 budget, so it was lowered. |
| Spoken answers: 60,000 characters a day for the whole service (12,000 a caller) | **$0.96 a day, about $29 a month**                        | 60,000 × $0.000016 (Polly neural, list price). The largest of the capped lines, larger than the assistant.               |
| Request form: 200 a day (5 a caller)                                            | under $0.001 a day                                        | 200 × $0.0000033. The cost that matters is a person reading them.                                                        |
| API: 25 requests a second, burst 50                                             | **about $6 a day** if it is hit without a break for a day | 2.16 million requests × $0.0000028.                                                                                      |
| CloudFront on top of that                                                       | about $2.60 a day                                         | Its own request fee, $0.0000012 each, is charged before the API throttle can say no.                                     |
| Assistant and form: 3 and 1 a second                                            | far below the rest                                        | Their own throttles.                                                                                                     |
| Model output                                                                    | 220 tokens                                                | A reply cannot grow the bill.                                                                                            |
| Model failures                                                                  | the plain answer costs nothing                            | If the model is off, slow, or fails a check, the rules answer instead.                                                   |
| Kill switch                                                                     | $0                                                        | `/vayu/assistant/enabled` off: no model, no guardrail.                                                                   |
| Athena                                                                          | 1 GB scanned per query                                    | A larger query is refused.                                                                                               |
| Lambda                                                                          | at most 2 minutes each                                    | Nothing runs for hours.                                                                                                  |
| Alerts                                                                          | none sent                                                 | Sends are off unless a person switches them on.                                                                          |

Everything at its cap for a whole month, with no flood: about $4.50 idle + $12.70 assistant + $29 spoken answers, roughly $46. That is close to the $50 budget, which only sends email.

## What is not capped

- **A flood against CloudFront itself is not capped.** AWS Budgets here send an email at $50 a month; they do not stop anything. The two budgets in the account (`vayu-hackathon-monthly` and `My Zero-Spend Budget`, both $50) were made by hand and are not part of the stack.
- A flood at the API's limit for a whole month would cost about $260 before anyone acted. A rate limit per address (AWS WAF costs about $5 a month plus $0.60 a million requests) would cap it; it is not set up.
- Open-Meteo counts each point of a request as one call, against 600 a minute and 10,000 a day for an address. The wind (285 points) is asked of it once in three hours and the air model (471 points) once in six, one hundred-point chunk at a time and kept in the API, with an old answer served if a refresh is refused and no retry for ten minutes. That is about 2,300 and 1,900 calls a day, per running copy of the API: well inside the allowance, and visitors' browsers ask neither. MET Norway (no key, 20 requests a second at most) is asked, a point at a time (about 200), only when Open-Meteo is out of allowance.
- The free OpenAQ and Open-Meteo services have their own rate limits (OpenAQ: 60 a minute). The app is built so that visitors never call OpenAQ directly: a scheduled job and the shared cache do. A flood can still use up the key's allowance, which is what happened once in testing. The result is gaps on the map, not a bill.

## How to check these figures

- Prices: `aws pricing list-price-lists` and `get-price-list-file-url` for the service and `ap-south-1` (CloudFront: `aws-other`).
- Guardrail units and tokens: call the model with `guardrailConfig.trace = "enabled"`; the response lists the text units used and the token counts.
- Lambda durations: the `REPORT` lines in each function's log group.
- Spend: the Billing console and AWS Budgets. The console showed $0.00 month to date on 10 October 2026, but billing lags and the account may still be in a free period, so that is not a measure of cost. The $4.50 is computed from list prices, not read from a bill.
