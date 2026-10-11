Vayu Air turns public air-quality data into a daily answer for a Delhi family or school. The backend is one AWS stack in Mumbai (ap-south-1), live at https://d3lmq1mze2gup3.cloudfront.net. The rule behind it: visitors never call a data provider. Scheduled jobs and a cache do.

AWS open source

- AWS CDK (TypeScript). The whole stack is one CDK app. Assertion tests check the caps and permissions: every function has a time limit, one model is callable, buckets are private. I used it so the safety rules are tested, not only written down.
- Powertools for AWS Lambda (Logger and Tracer). Every function logs through it, and the Tracer puts each AWS call into the X-Ray map, so I can see which function called what and how long it took.
- Not used: Strands, Cedar.

AWS services

- CloudFront and S3: one address for the app and the API, from a private bucket. Repeats come from cache.
- API Gateway (HTTP API) and Lambda: every /v1 route in one small function, throttled at 25 requests a second.
- DynamoDB: cache, daily quotas, device readings. On demand, with expiring items.
- EventBridge Scheduler: the 15-minute harvest and the 30-minute job that reads 7,268 monitors for the map. Retries are off.
- Amazon Bedrock (Nova Micro, with a Guardrail): only rewords an answer the rules already decided.
- Amazon Polly: reads answers aloud in English and Hindi.
- Step Functions: the alert loop (send, wait for a tap, remind, escalate). Sends are off.
- Secrets Manager and SSM Parameter Store: provider keys, and a kill switch for the assistant.
- CloudWatch and X-Ray: an alarm for each thing that can stop quietly, including a schedule that never runs.

IoT Core, Firehose and Athena are built and tested, but the unit talks to the phone, so they are not used.

Idle cost is about $4.50 a month. One assistant question costs about $0.0008.

---

Facts used
- Services: `infra/lib/` (`Site.ts`, `VayuStack.ts`, `Harvest.ts`, `Stations.ts`, `Assistant.ts`, `AlertLoop.ts`, `Operations.ts`) and the table in `docs/architecture.md`.
- Nova Micro through the `apac.amazon.nova-micro-v1:0` profile: `infra/lib/AlertLoop.ts`. Guardrail and Polly permission: `infra/lib/Assistant.ts`.
- CDK assertion tests: `infra/test/VayuStack.test.ts`.
- 7,268 monitors: `docs/SUBMISSION.md`. 25 requests a second, retries off: `docs/architecture.md`, `infra/test/VayuStack.test.ts`.
- $4.50 a month, $0.0008 a question: `docs/cost.md`.
- IoT, Firehose, Athena not used by the unit: `README.md` AWS table, `docs/AS-BUILT.md`.
- Powertools Logger and Tracer: `apps/api/package.json`, `apps/api/src/tracing.ts`, `apps/api/src/handler.ts`. No package lists Strands or Cedar. `README.md` line 60 says Powertools was not used; the code shows it was.
