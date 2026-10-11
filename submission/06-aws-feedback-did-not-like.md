Host header, CloudFront to API Gateway. My first live call to the API through CloudFront came back 403: CloudFront forwarded the viewer's Host header and API Gateway refused it. The fix was an origin request policy that forwards just `CloudFront-Viewer-Address`. AWS has a managed policy, `AllViewerExceptHostHeader`, for exactly this, and nothing in the 403 pointed me to it.

Bedrock guardrails. The prompt-attack filter blocked my own rewording instruction because it sat in the user turn. The assistant fell back to fixed text, and I noticed only because the "Wording by AI" label never appeared on a live question. With the trace off, my code saw only `stopReason: guardrail_intervened`, not which filter fired. Naming it would have shown the cause on the first call. I moved the instruction to the system prompt.

Bedrock model ids. In ap-south-1, calling Nova Micro by its bare model id is refused. Only the regional inference profile `apac.amazon.nova-micro-v1:0` works, and the IAM policy then needs the profile ARN plus a foundation-model ARN with a wildcard region. The IAM side is the trap: the error gives no hint that the policy needs two ARNs, one with a wildcard region. A grant for an inference profile in stable `aws-cdk-lib` (it exists only in the alpha Bedrock module) would fix it.

CDK and CloudFormation. My first deploy failed, and the rollback failed too: an API stage setting named a route that did not exist yet. It passed `cdk synth` and every test, and only `cdk deploy` failed. A synth-time warning for a stage that names a route not yet created would have saved the failed deploy.

EventBridge Scheduler. A schedule that never runs raises no error. I added a CloudWatch alarm on too few invocations, with missing data counted as bad. A ready-made "did not fire" alarm would remove that work.

Step Functions. `states:SendTaskSuccess` has no resource-level permission, so my API function grants it on `*`. Letting me scope it to the state machine that issued the task token would close that gap.
