**In one line.** One CDK stack: one CloudFront address in front of the app and the API, one Lambda behind API Gateway, two scheduled jobs that keep the data fresh, and one rule for the AI: code decides, the model only words.

**Language and layout.** TypeScript throughout, in one npm workspace: the React app, the API, the rules, the data clients, the alert loop and the infrastructure. The rules package is pure TypeScript with no network, database or clock, so every rule is easy to test: the AQI scale, GRAP estimation, walk advice, exposure, and the assistant's rules in English and Hindi.

**Front end.** React with React Router, built by Vite. MapLibre GL draws the map (monitors, wind, NASA fires) on OpenFreeMap tiles. D3 scales and shapes draw the charts. Web Bluetooth connects the measuring unit. Mobile-first at 390 px, with a wider layout on a laptop.

**Contracts.** Zod schemas, shared by the app and the API, check every request and every answer. An answer that does not match its schema is an error, never a number on screen.

**AWS.**

- **Amazon CloudFront** serves the app from a private **Amazon S3** bucket and passes `/v1/*` to **Amazon API Gateway** (HTTP API: 25 requests a second, burst 50; 3 a second for the assistant; 1 for the form). A JWT authorizer guards the one account route.
- **One AWS Lambda** (Node 22, Graviton, 256 MB, 10 s) serves every route, with **Powertools** logging and tracing.
- **Amazon EventBridge Scheduler** runs two jobs with retries off: every 15 minutes it refreshes four reference places; every 30 it reads about 7,200 monitors for the map. **Amazon DynamoDB** (on-demand, TTL) holds the cache, accounts, quotas and cached speech.
- **Amazon Bedrock** (Nova Micro through the `apac.` inference profile, with a Guardrail) may reword the rules' answer; **Amazon Polly** (Kajal) reads it aloud; **Amazon Cognito** holds optional accounts; **Secrets Manager** holds keys; one **Systems Manager** parameter switches the model off.
- **CloudWatch** (8 alarms and a dashboard), **SNS**, **X-Ray**. **AWS Step Functions** holds an alert loop that is deployed, tested and switched off.

**The invariant.** Fixed rules decide the advice. The model gets the rules' answer and the facts, and may reword it or answer a question no rule covers from those facts. Code then checks that every number it wrote is one of the facts, that it did not call the air good unless the level is Good, and that safety lines survived. On any doubt the rules' own text goes out. Hindi answers never reach the model. Property-based tests (fast-check) try random outputs against the number check, and a CDK test proves the stack's permissions allow exactly one model and one guardrail.

**Hardware.** An ESP32-S3 (Arduino C++) reads a Sensirion SPS30 laser particle sensor over UART and sends an 18-byte Bluetooth LE packet every two seconds. The page parses it and checks it for plausibility; it is never sent to the API. The firmware restarts the sensor on connect and after three failed reads.

**Tests.** Vitest and fast-check: 1,285 tests, with lint, strict types, `cdk synth` and a bundle check, in one command; a smoke test and browser scripts run against the live address.
