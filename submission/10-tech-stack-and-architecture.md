For the "tech stack and architecture" part of the video and any form box that asks for it.

**Stack.** TypeScript throughout, in one npm workspace.

| Layer          | What                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App            | React, Vite, React Router, MapLibre GL for the map, D3 scales and shapes for charts, Web Bluetooth for the unit                                                                                                                      |
| Contracts      | Zod schemas shared by the app and the API: every API answer is checked before use, and a bad one is an error, never a number                                                                                                         |
| Rules          | The core package is pure TypeScript with no network: the AQI scale, GRAP and walk advice, exposure and the assistant's rules, so it is easy to test. The data package holds the OpenAQ, Open-Meteo and FIRMS clients and the harvest |
| API            | One Lambda behind API Gateway; AWS SDK v3; Powertools Logger and Tracer                                                                                                                                                              |
| Infrastructure | AWS CDK in TypeScript, with assertion tests for the safety rules                                                                                                                                                                     |
| Hardware       | ESP32-S3 (Arduino C++) reading a Sensirion SPS30 over UART, sending an 18-byte Bluetooth LE packet every two seconds                                                                                                                 |
| Tests          | Vitest and fast-check: 1,263 tests, with lint, types, `cdk synth` and a bundle check, in one command, `make prove`; a live smoke test runs separately (`make smoke`)                                                                 |

**Architecture, in one paragraph.** A visitor's browser asks CloudFront for the app (S3) and for `/v1` (API Gateway, then one Lambda). Two EventBridge schedules fetch the nearest monitors and the forecast and keep them in DynamoDB, so a browser never calls the air providers. Four reference places are served from that cache; for every other place the Lambda fetches the data when asked, and CloudFront caches the answer. It applies the rules, and returns one answer with its source and age. For a question to the assistant, Bedrock (Nova Micro, behind a guardrail) may reword the rules' answer; every number it uses must be one of the facts (a set check, not a check of where it sits), or the rules' own text goes out. Polly reads answers aloud. Secrets Manager holds keys, an SSM parameter is the off switch, and CloudWatch alarms cover each failure that would be silent.

**The invariant.** The model never supplies a number: code decides, and every number in its wording must be in the facts.
