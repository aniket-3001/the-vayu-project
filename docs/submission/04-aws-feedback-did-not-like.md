Host header, CloudFront to API Gateway. My first live call to the API through CloudFront came back 403: CloudFront forwarded the viewer's Host header and API Gateway refused it. The fix was an origin request policy that forwards just `CloudFront-Viewer-Address` (`infra/lib/Site.ts`). AWS has a managed policy, `AllViewerExceptHostHeader`, for exactly this, and nothing in the 403 pointed me to it. A hint in the 403 would have saved my first live debug.

Bedrock guardrails. The prompt-attack filter blocked my own rewording instruction because it sat in the user turn. The assistant fell back to fixed text, and I noticed only because the "Wording by AI" label never appeared on a live question. My code saw only `stopReason: guardrail_intervened` (`packages/watch/src/phrase.ts`). With the trace off, the response does not say which filter fired. If the response named the filter that fired even with the trace off, I would have seen the cause on the first call. I moved the instruction to the system prompt.

Bedrock model ids. In ap-south-1, calling Nova Micro by its bare model id is refused. Only the regional inference profile `apac.amazon.nova-micro-v1:0` works, and the IAM policy then needs the profile ARN plus a foundation-model ARN with a wildcard region (`infra/lib/Assistant.ts`). The IAM side is the trap: the error gives no hint that the policy needs two ARNs, one with a wildcard region. One CDK grant per inference profile would fix it.

CDK and CloudFormation. My first deploy failed, and the rollback failed too: an API stage setting named a route that did not exist yet. It passed `cdk synth` and every test, and only `cdk deploy` failed. A synth-time warning for a stage that names a route not yet created would have saved the failed deploy.

EventBridge Scheduler. A schedule that never runs raises no error. I added a CloudWatch alarm on too few invocations, with missing data counted as bad (`infra/lib/Operations.ts`). A ready-made "did not fire" alarm would remove that work.

Step Functions. `states:SendTaskSuccess` has no resource-level permission, so my API function grants it on `*` (`infra/lib/VayuStack.ts`). Letting me scope it to the state machine that issued the task token would close that gap.

---

Facts used

- Host 403: `docs/learning-log.md` row 1, `infra/lib/Site.ts` lines 133-137, `infra/test/VayuStack.test.ts` line 308.
- Guardrail filter, `guardrail_intervened` seen by code (`packages/watch/src/phrase.ts` line 154), and "Wording by AI" label: `docs/learning-log.md` row 2, `docs/AS-BUILT.md` "Checked, not assumed", `infra/lib/Assistant.ts` (PROMPT_ATTACK filter; the call sets no trace).
- Bare id versus inference profile, ARNs: `docs/SUBMISSION.md` "Feedback on AWS", `infra/lib/Assistant.ts` lines 12-13 and 98-105, `infra/lib/AlertLoop.ts` lines 89-100.
- Failed deploy and rollback: `docs/learning-log.md` row 6, `docs/AS-BUILT.md` "Things found by testing the live site".
- Alarm on missing invocations: `infra/lib/Operations.ts` (`TreatMissingData.BREACHING`), `infra/test/VayuStack.test.ts` lines 451-458, `docs/SUBMISSION.md` ("neither is a default").
- No resource scope for the task-token action: `infra/lib/VayuStack.ts` lines 184-192.
