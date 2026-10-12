What I liked most: several hard problems became one setting or one line.

**Amazon DynamoDB: a fair quota in one call.** The assistant's 500-a-day cap is a single conditional UpdateItem: add one only if there is room. Two requests at the same moment cannot both take the last slot. No lock, no extra service. TTL deletes old counters, and on-demand mode left nothing to size for a demo with unknown traffic.

**AWS CDK: safety rules as failing tests.** CDK assertion tests read the synthesized template before anything deploys. "Every Lambda on arm64", "no function time limit over 2 minutes", "buckets block public access", "only the account route needs a token" and "only one policy may grant `states:SendTaskSuccess`" are all tests. Break one and the build fails.

**Amazon Bedrock Converse with Guardrails.** The guardrail rides in the same Converse call, so there is no second request to orchestrate, and `stopReason` tells my code when it stepped in, so the rules' own text goes out. With the trace on for one test call, the response listed the text units and tokens used. That is how I know a question costs $0.0008 and that 98% of it is the guardrail, so the caps went there.

**Amazon CloudFront cache policies.** Minimum and default TTL 0, maximum 15 minutes: the API decides with `cache-control`, and an answer without one, such as an error, is never kept. A repeat lookup drops from 1.5 s to about 0.15 s with no cache code of mine.

**AWS Systems Manager Parameter Store as a kill switch.** The assistant runs only while one parameter reads exactly "true". Any other value, or a failed read, means off. One command stops all model spend within a minute, with no deploy.

**Amazon EventBridge Scheduler: retries are a setting.** I set them to zero on both jobs, so a failed run waits for the next one instead of piling up. A CDK test holds that.

**Amazon Polly and Amazon Cognito.** One neural voice, Kajal, reads English and Hindi, which is what a Delhi household speaks. Cognito with the API Gateway JWT authorizer gave me accounts with no auth code of my own in the API.

**AWS Price List API.** It gave me the ap-south-1 list prices, so every line of my cost model can be checked.
