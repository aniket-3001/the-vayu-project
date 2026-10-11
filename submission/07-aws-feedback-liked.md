AWS CDK assertion tests. I could check the synthesized CloudFormation before any deploy, so a safety rule became a failing test. Two examples that fail the build: a function without an explicit time limit, or with one over two minutes, and a second policy granting `states:SendTaskSuccess`.

DynamoDB. The assistant's 500-a-day cap in `apps/api/src/quota.ts` is one conditional `UpdateItem`. It adds to a counter only if there is room, so two requests at once cannot both take the last one. There is no lock and no extra service. TTL expires the counter after two days, and on-demand mode left nothing to size.

Bedrock. One Converse call to Nova Micro rewords an answer, and the guardrail checks the question and the answer, one text unit each. With the trace turned on for a test call, the response listed the text units and tokens, so a question's cost, $0.0008 (98% of it the guardrail), is measured on the deployed guardrail, not guessed (`docs/cost.md`).

Step Functions. A person's tap became a step in the workflow, with no polling code. `waitForTaskToken` pauses the alert loop until the tap, and `TimeoutSecondsPath` takes each wait's length from the input, so no alert waits for ever.

EventBridge Scheduler. I liked that retries are a setting on the schedule itself. I set them to zero so a failed harvest waits for the next 15-minute run instead of stacking up behind it, and a test holds that (`infra/test/VayuStack.test.ts`).

AWS Price List API. `aws pricing get-price-list-file-url` gave me the list prices, and I put the sums in `docs/cost.md`. The prices are for ap-south-1, with CloudFront at its India rate, so every line in the cost document is the list price for my region, not a guess, and can be checked against the source.
