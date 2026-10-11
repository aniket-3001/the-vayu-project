Host header, CloudFront to API Gateway. My first live call to the API through CloudFront came back 403. CloudFront was forwarding the viewer's Host header and API Gateway answered it with that 403. I found the cause only by testing the live address, and asked for an origin request policy that forwards just the viewer address. The CloudFront docs for API Gateway origins should say Host must not be forwarded, and the 403 could name the cause.

Guardrails. The prompt-attack filter blocked my own rewording instruction because it sat in the user turn. Nothing looked broken: the assistant fell back to fixed text, and I noticed only because the "Wording by AI" label never appeared on a live question. My code saw only `stopReason: guardrail_intervened` (`packages/watch/src/phrase.ts`). AWS could name the filter that fired in that same response. I moved the instruction to the system prompt.

Model ids. In ap-south-1 the model list shows Nova Micro as ACTIVE, but calling its bare id is refused and only the regional inference profile `apac.amazon.nova-micro-v1:0` works. The IAM policy then needs the profile ARN plus a foundation-model ARN with a wildcard region (`infra/lib/Assistant.ts`). The model list should say which models need a profile and show its id.

CloudFormation. My first deploy failed, and the rollback failed too: an API stage setting named a route that did not exist yet. It passed synth and every test; only `cdk deploy` failed. A synth-time warning for a stage that names a route not yet created would have saved the failed deploy.

A schedule that never runs raises no error. I asked for a CloudWatch alarm on too few invocations, with missing data counted as bad (`infra/lib/Operations.ts`). EventBridge Scheduler could offer that alarm ready made.

`states:SendTaskSuccess` and `polly:SynthesizeSpeech` take no resource, so I could only scope them to `*`. Scoping by state machine or by voice would let me narrow them.

---

Facts used

- Host 403: `docs/learning-log.md` row 1, `infra/lib/Site.ts` lines 133-137, `infra/test/VayuStack.test.ts` line 308.
- Guardrail filter, `guardrail_intervened` seen by code (`packages/watch/src/phrase.ts` line 154), and "Wording by AI" label: `docs/learning-log.md` row 2, `docs/AS-BUILT.md` "Checked, not assumed", `infra/lib/Assistant.ts` (PROMPT_ATTACK filter).
- Bare id versus inference profile, ARNs: `docs/SUBMISSION.md` "Feedback on AWS", `infra/lib/Assistant.ts` lines 12-13 and 98-105, `infra/lib/AlertLoop.ts` lines 89-100. The "ACTIVE in the list" detail comes from `/Users/hrshkr/Downloads/wmd/vayu-labs/tracker/AWS-FEEDBACK.md` only.
- Failed deploy and rollback: `docs/learning-log.md` row 6, `docs/AS-BUILT.md` "Things found by testing the live site".
- Alarm on missing invocations: `infra/lib/Operations.ts` (`TreatMissingData.BREACHING`), `infra/test/VayuStack.test.ts` lines 451-458, `docs/SUBMISSION.md` ("neither is a default").
- No resource scope: `infra/lib/Assistant.ts` (Polly comment), `infra/lib/VayuStack.ts` lines 184-192.
