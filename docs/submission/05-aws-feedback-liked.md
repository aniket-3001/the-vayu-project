CDK assertion tests. I could check the synthesized CloudFormation before any deploy, so a rule I wrote down could fail the build. Two examples that fail the build: a function without a time limit of at most two minutes, and a second policy granting `states:SendTaskSuccess`.

DynamoDB. The assistant's 500-a-day cap in `apps/api/src/quota.ts` is one conditional `UpdateItem`. It adds to a counter only if there is room, so two requests at once cannot both take the last one. There is no lock and no extra service. TTL deletes the counter two days later, and on-demand mode left nothing to size.

Bedrock. One Converse call to Nova Micro rewords an answer. The guardrail checks the question and the answer, one text unit each, and it is 98% of a question's cost. The response trace listed the units and tokens, so the figure in `docs/cost.md` is measured.

Step Functions. `waitForTaskToken` with `TimeoutSecondsPath` lets the alert loop wait for a person's tap for a time taken from the input. Every wait has a limit, as rule I9 requires (`docs/safety.md`).

Athena. Built but not used by the unit, so this is from the config and its tests, not a run here: the 1 GB per-query scan limit cannot be overridden and is one line of CDK (`infra/lib/Analytics.ts`).

AWS Price List API. I had the assistant read it and put the sums in `docs/cost.md`. The prices are for ap-south-1, with CloudFront at its India rate, so each line can be checked against the source.

---

Facts used

- Assertion tests: `infra/test/VayuStack.test.ts` lines 35 (buckets block public access), 195 (one `SendTaskSuccess`), 362 and 423 (retries off); function time limit: line 699.
- Conditional update and TTL: `apps/api/src/quota.ts`; 500 a day: `docs/cost.md` "What the limits allow", `apps/api/src/assistantRoute.ts` line 73; on demand: `docs/architecture.md`.
- Cost per question, 98%, token cost, trace: `docs/cost.md` "Cost of one thing" and "How to check these figures".
- `waitForTaskToken`, `TimeoutSecondsPath`: `infra/lib/alertLoopDefinition.ts` lines 41 and 50.
- Athena scan limit and projection and archive table: `infra/lib/Analytics.ts`, `infra/test/VayuStack.test.ts` lines 561 and 586.
- Price List API: `docs/cost.md` opening and "How to check these figures".
