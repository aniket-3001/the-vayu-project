Bedrock model ids. I called Nova Micro in ap-south-1 by its model id. The model list shows it as ACTIVE, yet the call was refused: "on-demand throughput isn't supported, use an inference profile". Only the `apac.` profile id works, and the IAM policy needs the profile ARN plus a foundation-model ARN with a wildcard region. Please mark which models need a profile, and show the profile id beside the model id.

Bedrock Guardrails. The prompt-attack filter blocked my own rewording instruction because it sat in the user turn. Nothing failed loudly. The assistant simply never used the model, and I only found out by asking a live question. Moving the instruction into the system prompt fixed it. The Converse docs could say plainly what the filter scans.

CloudFront. On a new account, creating a distribution was refused with AccessDenied until a Support case verified the account. The error did not say so. I deployed the data layer first and the site later. Say it up front, with the wait time.

CloudFormation. My first deploy failed because an API stage setting named a route before it existed, and the rollback failed too. Catch that ordering at synth time, or name the missing resource.

Athena. A query over a table whose partition projection range ran to 10,000,000 location ids sat in RUNNING for five minutes, scanned zero bytes and gave no error. An injected projection ran in 3.6 seconds. Warn, or fail fast, when a range implies millions of partitions.

Step Functions and Polly. `states:SendTaskSuccess` and `polly:SynthesizeSpeech` take no resource, so both are granted on `*`. Resource-level permissions would let me scope them.

CDK. With no terminal attached, `cdk deploy` stops at the security prompt. With two profiles, a diff against the wrong account showed everything as new, which looked like a bug. Print the account and profile on the first line.

---

Facts used
- Inference profile and IAM shape: `infra/lib/AlertLoop.ts` (`PHRASING_PROFILE_ID`, ARNs), `/Users/hrshkr/Downloads/wmd/vayu-labs/tracker/AWS-FEEDBACK.md` Bedrock entry, `docs/SUBMISSION.md` "Feedback on AWS".
- Guardrail blocked the instruction: `docs/learning-log.md` row 2, `infra/lib/Assistant.ts` (PROMPT_ATTACK filter), `docs/LIVE-CHECKLIST.md`.
- CloudFront refused until verification: AWS-FEEDBACK.md "CloudFront and account verification", `infra/bin/app.ts` (`includeSite`), `infra/test/VayuStack.test.ts` line 216.
- Failed deploy and rollback: `docs/learning-log.md` row 6.
- Athena stuck query: AWS-FEEDBACK.md "Athena", `infra/lib/Analytics.ts` (injected projection comment).
- Actions with no resource scope: `infra/lib/VayuStack.ts` line 190, `infra/lib/AlertLoop.ts` line 77, `infra/test/VayuStack.test.ts` line 195.
- CDK terminal prompt and wrong-account diff: AWS-FEEDBACK.md "CDK / CloudFormation".
