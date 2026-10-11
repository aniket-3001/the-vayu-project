CDK and CloudFormation. Assertion tests on the synthesized template caught mistakes before any deploy. One checks that exactly one policy grants `states:SendTaskSuccess`; others check that every function has a time limit and every bucket is private. `cdk diff` made IAM changes readable. My safety rules are tests, not promises.

Bedrock. Nova Micro takes one Converse call, there was no model-access request to wait for, and short replies came back in about 0.5 to 0.8 seconds. The guardrail's trace lists the text units and token counts, so I could price a question exactly: about $0.0008, and 98% of that is the guardrail.

Step Functions. `validate-state-machine-definition` and the `test-state` API let me run each data step (`ArrayGetItem`, `MathAdd`, `ArrayLength`, a numeric comparison) on the real service without creating anything. `waitForTaskToken` with `TimeoutSecondsPath` gave the alert loop a wait that has a time limit.

IAM policy simulator. `simulate-custom-policy` gave a clear allowed or implicitDeny for each resource ARN, so I could show that the function may call one model and no other before deploying.

DynamoDB. A conditional write (`attribute_not_exists`) was enough to make "never send twice" true, with no extra service. On demand and TTL meant nothing to size and old items expire.

Athena. Partition projection means no crawler and no repair step. A query over my own data scanned 1.9 MB in under a second. The workgroup's scan limit is one line and caps a mistake at 1 GB. A Mumbai workgroup read the public OpenAQ bucket in us-east-1 with no setup.

AWS Price List API. I read every price for ap-south-1 from it, so `docs/cost.md` holds real figures and a way to check them.

EventBridge Scheduler. The free 14 million invocations covered both jobs at no cost, and a schedule can be switched off without removing it.

---

Facts used
- Assertion tests, one `SendTaskSuccess` policy, time limits, private buckets: `infra/test/VayuStack.test.ts` lines 35, 195; `docs/safety.md` rule I9.
- Converse call, 0.5 to 0.8 seconds, no access request: `/Users/hrshkr/Downloads/wmd/vayu-labs/tracker/AWS-FEEDBACK.md` Bedrock entry.
- $0.0008 a question, 98% guardrail, trace text units: `docs/cost.md`.
- `test-state`, `validate-state-machine-definition`, `TimeoutSecondsPath`: AWS-FEEDBACK.md "Step Functions", `infra/lib/alertLoopDefinition.ts`.
- IAM simulator: AWS-FEEDBACK.md "IAM policy simulator"; `infra/test/VayuStack.test.ts` line 168.
- Conditional write and TTL: AWS-FEEDBACK.md "DynamoDB", `infra/test/VayuStack.test.ts` lines 25, 204.
- Athena (1.9 MB, under a second, cross-region read, 1 GB limit): AWS-FEEDBACK.md "Athena", `infra/lib/Analytics.ts`, `infra/test/VayuStack.test.ts` line 561.
- Price List API: `docs/cost.md` ("How to check these figures").
- Scheduler free 14 million, off switch: `docs/cost.md`, `infra/lib/Harvest.ts`, `infra/test/VayuStack.test.ts` line 371.
