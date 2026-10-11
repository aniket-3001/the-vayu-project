**What it does:** the Vayu Project turns public air data into a daily decision for a Delhi family. It runs as one CDK stack in Mumbai (ap-south-1). Browsers call my API, not the air providers; only place search, map tiles and a wind fallback go direct.

**AWS open source**

- **AWS CDK:** the whole stack, in TypeScript. Assertion tests turn safety rules into failing builds: function time limits, public access blocked on buckets, one callable model, caps.
- **Powertools for AWS Lambda (Logger, Tracer):** structured logs, and X-Ray traces of each AWS call.

**AWS services, and why each is there**

- **CloudFront and S3:** one address for the app and the API, and a private bucket. CloudFront keeps an answer as the API says, up to 15 minutes.
- **API Gateway and Lambda:** every `/v1` route in one function; all functions on Graviton (arm64). 25 requests a second, and 3 a second for the assistant and speech.
- **DynamoDB:** cache, daily quotas and alert records. On-demand, so nothing to size; TTL expires counters. The 500-a-day assistant cap is one conditional write.
- **EventBridge Scheduler:** a 15-minute job fetches the nearest monitor and forecast for four fixed Delhi places, so those cards come from DynamoDB, not OpenAQ. A 30-minute job reads 7,268 monitors for the map. Retries are off, so a bad run cannot pile up.
- **Bedrock:** Nova Micro through the `apac.amazon.nova-micro-v1:0` inference profile, behind a Guardrail. The model rewords an answer the rules decided, or answers from the facts given. Code rejects any number not in the facts. If the model is slow, capped or off, the rules' own text goes out.
- **Step Functions:** one flow sends an alert, waits for a tap and reminds (built and tested; live Telegram sends are off); another checks a room again after advice to see if it helped. Neither runs live yet.
- **Polly** reads answers aloud in English and Hindi. **Secrets Manager** holds the keys and tokens. An **SSM parameter** switches the assistant off without a deploy. **CloudWatch** alarms (a harvest that stops, API 5xx, a failed send) publish to **SNS**; **X-Ray** holds the traces.

**Cost and limits:** idle about $4.50 a month at list prices; an assistant question $0.0008, 98% of it the guardrail, so the caps go on the assistant: 40 questions a caller, 500 a day.

**Built but not used by the unit yet:** IoT Core, Firehose, Glue, Athena and the Rooms table.
