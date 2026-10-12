Most of my lost hours came from errors that did not name their cause. Six, each with a fix I would suggest.

**Amazon Bedrock Guardrails: say which filter fired.** My assistant never answered at first. The prompt-attack filter was blocking my own rewording instruction because it sat in the user turn. With the trace off, the Converse response said only `guardrail_intervened`, not which filter. Moving the instruction to the system prompt fixed it. Naming the policy type in every intervention would have shown the cause on the first call.

**Amazon Bedrock in ap-south-1: model ids and IAM.** Nova Micro by its bare model id is refused in Mumbai; only the inference profile `apac.amazon.nova-micro-v1:0` works. The IAM policy then needs two ARNs: the profile, and the foundation model with a wildcard region. The access-denied error gives no hint of the second. A model-page note on which regions need a profile, and an error that names the ARN it checked, would remove the trap.

**Amazon CloudFront to Amazon API Gateway: a bare 403.** CloudFront forwarded the viewer's Host header and API Gateway answered 403. The managed policy `AllViewerExceptHostHeader` exists for exactly this, but nothing in the 403 points to it. A hint in the error would save the hour.

**AWS CDK and CloudFormation: a deploy and its rollback both failed.** An API stage's per-route throttle setting named a route that did not exist yet. The setting is an untyped map, so it passed `cdk synth` and every test; only the deploy failed, and then the rollback failed too. A synth-time check that route settings name existing routes would have caught it.

**Amazon EventBridge Scheduler: silence on failure.** A schedule that stops firing raises no error. I built a CloudWatch alarm on fewer than one invocation in 45 minutes, with missing data treated as breaching. A built-in "did not fire" alarm would save that work.

**AWS Step Functions: `states:SendTaskSuccess` cannot be scoped.** It has no resource-level permission, so my API function holds it on `*`. I added a CDK test that only one policy may grant it, but I would rather scope it to the one state machine.
