One CDK stack in Mumbai (ap-south-1). A visitor's browser never calls an air or fire provider: two scheduled jobs and my API do, and keep what they fetch. Only place search, map tiles and a wind fallback go straight from the browser.

AWS open source

- AWS CDK: the whole stack. Assertion tests hold the rules: function time limits, public access blocked on buckets, one callable model, caps.
- Powertools for AWS Lambda (Logger, Tracer): structured logs, and X-Ray traces of each AWS call.

AWS services

- CloudFront and S3: one address for app and API; private bucket. CloudFront keeps an answer as the API says, up to 15 minutes.
- API Gateway and Lambda: every /v1 route in one function, at 25 requests a second.
- DynamoDB: cache, daily quotas, alert records.
- EventBridge Scheduler: a 15-minute job fetching the nearest monitor and forecast for four fixed Delhi places, so those cards come from DynamoDB, not OpenAQ, and a 30-minute job reading 7,268 monitors for the map. Retries are off, so a bad run cannot pile up.
- Bedrock: Nova Micro through the `apac.amazon.nova-micro-v1:0` inference profile, behind a Guardrail. The model rewords an answer the rules decided, or answers from the facts given. Code rejects any number not in the facts. If the model is slow, capped or off, the rules' own text goes out.
- Polly: reads answers aloud in English and Hindi.
- Step Functions: AlertLoop (send, wait for a tap, remind; sends off) and FixCheck, "did it work?".
- Secrets Manager: the OpenAQ and NASA FIRMS keys, the Telegram token and the address-hash salt. SSM Parameter Store: the assistant's kill switch.
- CloudWatch and SNS: an alarm for each failure that would otherwise be silent (a harvest that stops, API 5xx, a failed send), published to an SNS topic.

One failure: OpenAQ rate-limited the first full map run and it timed out. It now waits as long as OpenAQ asks, spaces its requests and stops at a time budget. Later OpenAQ rejected my key with a 401; I put a new one in Secrets Manager and the job read 7,268 monitors.

IoT Core, Firehose, Athena, Glue and the Rooms table are built, unused. Idle cost: about $4.50 a month; an assistant question, $0.0008.

---

Facts used

- Services and what each does: `infra/lib/` (`Site.ts`, `VayuStack.ts`, `Harvest.ts`, `Stations.ts`, `Assistant.ts`, `AlertLoop.ts`, `FixCheck.ts`, `Operations.ts`, `Analytics.ts`) and `docs/architecture.md`.
- Browser calls only search, tiles and a wind fallback (when our API has none): `docs/architecture.md` "The picture", dotted lines and the data table (wind row).
- Cache-control set by the API, CloudFront keeps up to 15 minutes: `apps/api/src/respond.ts` (`okCached`), `infra/test/VayuStack.test.ts` line 294; smoke test "CloudFront keeps a repeat answer" in `tests/smoke/live.ts`.
- Inference profile: `infra/lib/Assistant.ts` line 12. Six-second model wait: `apps/api/src/assistantAgent.ts` (`modelTimeoutMs`). Number check and fallback: `docs/safety.md` rule I6, `docs/AGENT-BOUNDARIES.md`. Kill switch: `docs/AGENT-BOUNDARIES.md`.
- FixCheck: `infra/lib/FixCheck.ts`. AlertLoop: `infra/lib/AlertLoop.ts`.
- Rooms table unused: `docs/architecture.md`, `docs/AS-BUILT.md` (device messaging row).
- 7,268 monitors: `docs/SUBMISSION.md`. 25 requests a second: `docs/architecture.md`. Retries off: `infra/test/VayuStack.test.ts` line 362.
- CDK assertion tests (time limits line 699, public access block line 35, one model line 168, caps line 50): `infra/test/VayuStack.test.ts`.
- Powertools: `apps/api/package.json`, `apps/api/src/tracing.ts`, `apps/api/src/handler.ts`; `README.md` (AWS open source line).
- Secrets Manager keys and SSM kill switch: `docs/architecture.md` table, `infra/lib/Assistant.ts`.
- Map job failure: `docs/learning-log.md` row 5.
- $4.50 a month, $0.0008 a question: `docs/cost.md`.
