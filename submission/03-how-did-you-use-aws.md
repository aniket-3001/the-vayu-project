The whole product runs as one AWS CDK stack in Mumbai (ap-south-1). Browsers call my API, never the air-data providers, so keys, caching and spending limits sit in one place. The API fetches public air data, applies fixed rules and returns one answer with its source and age.

**AWS open source**
- **AWS CDK (TypeScript):** the entire stack. CDK assertion tests turn safety rules into failing builds: every Lambda on arm64 with a time limit of 2 minutes or less, every bucket blocks public access, only the account route needs a token.
- **Powertools for AWS Lambda (Logger, Tracer):** structured logs and an X-Ray trace of each AWS call.

**AWS services, and why each**
- **Amazon CloudFront + Amazon S3 (private bucket):** one address for the app and the API, so no CORS. The API says how long an answer may be kept, up to 15 minutes. A repeat lookup returns in about 0.15 s; a fresh one takes a median 1.5 s.
- **Amazon API Gateway (HTTP API) + AWS Lambda** (Node 22, Graviton): one function for every route. Each request and answer is checked against a schema, so a bad answer becomes an error, never a number. Throttle: 25 requests a second, 3 for the assistant.
- **Amazon DynamoDB** (on-demand, TTL): the cache, saved accounts, and the daily quotas. A quota is one conditional UpdateItem, so two requests cannot both take the last slot. No lock.
- **Amazon EventBridge Scheduler:** every 15 minutes it refreshes four reference places; every 30 it reads about 7,260 monitors for the map. Retries are off, so a bad run cannot pile up.
- **Amazon Bedrock (Nova Micro) with Guardrails:** rules decide, the model only rewords. A number not in the facts, and the rules' own text goes out. 220 tokens at most, 6-second timeout.
- **Amazon Polly (voice Kajal):** answers read aloud in English and Hindi.
- **Amazon Cognito + JWT authorizer:** optional accounts; saved data is keyed by the user id in the verified token.
- **AWS Secrets Manager** (keys), **Systems Manager Parameter Store** (a switch that turns the model off without a deploy), **Amazon CloudWatch** (8 alarms) with **Amazon SNS**, **AWS X-Ray**.
- **AWS Step Functions:** an alert loop that waits for a tap. Built and tested, not live.

**Cost.** About $4.50 a month idle, from AWS list prices. An assistant question costs about $0.0008, 98% of it the guardrail, so the caps sit there: 40 a day per caller, 500 a day in all.
