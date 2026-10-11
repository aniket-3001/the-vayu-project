AWS CDK assertion tests. I could check the synthesized CloudFormation before any deploy, so a safety rule became a failing test. Two examples that fail the build: a function without an explicit time limit, or with one over two minutes, and a second policy granting `states:SendTaskSuccess`.

DynamoDB. The assistant's 500-a-day cap in `apps/api/src/quota.ts` is one conditional `UpdateItem`. It adds to a counter only if there is room, so two requests at once cannot both take the last one. There is no lock and no extra service. TTL expires the counter after two days, and on-demand mode left nothing to size.

Bedrock. One Converse call to Nova Micro rewords an answer, and the guardrail checks the question and the answer, one text unit each. With the trace turned on for a test call, the response listed the text units and tokens, so a question's cost, $0.0008 (98% of it the guardrail), is measured on the deployed guardrail, not guessed (`docs/cost.md`).

Step Functions. A person's tap became a step in the workflow, with no polling code. `waitForTaskToken` pauses the alert loop until the tap, and `TimeoutSecondsPath` takes each wait's length from the input, so no alert waits for ever.

EventBridge Scheduler. I liked that retries are a setting on the schedule itself. I set them to zero so a failed harvest waits for the next 15-minute run instead of stacking up behind it, and a test holds that (`infra/test/VayuStack.test.ts`).

AWS Price List API. I had Claude Code read it with `aws pricing get-price-list-file-url` and put the sums in `docs/cost.md`. The prices are for ap-south-1, with CloudFront at its India rate, so every line in the cost document is the list price for my region, not a guess, and can be checked against the source.

---

Facts used

- Assertion tests: `infra/test/VayuStack.test.ts` lines 35 (buckets block public access), 195 (one `SendTaskSuccess`), 362 and 423 (retries off); function time limit: line 699.
- Conditional update and TTL: `apps/api/src/quota.ts`; 500 a day: `docs/cost.md` "What the limits allow", `apps/api/src/assistantRoute.ts` line 73; on demand: `docs/architecture.md`.
- Cost per question, 98%, token cost, trace: `docs/cost.md` "Cost of one thing" and "How to check these figures".
- `waitForTaskToken`, `TimeoutSecondsPath`: `infra/lib/alertLoopDefinition.ts` lines 41 and 50.
- Scheduler retries off: `infra/lib/Harvest.ts` line 82, `infra/test/VayuStack.test.ts` lines 362-367.
- Price List API: `docs/cost.md` opening and "How to check these figures".
