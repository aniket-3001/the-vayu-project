**Give the model the smallest job, then check it in code.** Fixed rules choose the advice; the model may word it, and any number it writes must be one of the facts. Every failure I had with the model sat where that line was loose. The guardrail blocked my own instruction because I had put it in the user turn. My number check read a masked name, "[person 1]", as the number 1. A live answer called AQI 61 "good". Each is now a test. "The model usually gets it right" is not a specification; "any number must be in the facts" is.

**Real AWS finds what tests do not.** I had a green test suite before the first deploy. The first live call still returned 403 (a forwarded Host header), the first live question never reached the model, and the first deploy failed and then failed to roll back. Tests run against fakes; they cannot show how CloudFront, Bedrock or CloudFormation really behave. A smoke test against the live address after every deploy found what the unit tests could not.

**Price every metered thing before you set a cap.** One test call with the guardrail trace on showed that a $0.0008 question is 98% guardrail, not model. That put the caps on the assistant, where the cost is. Otherwise I would have capped the wrong thing.

**Read your own screenshots as a stranger would.** Mine showed AQI 500 beside "GRAP Stage II". I had looked at it many times. The estimate had averaged the last 24 hours the monitor had, not the last 24 hours, so the number was computed correctly from the wrong data.

**Say what you did not measure.** I measured the cleaner's airflow, not its CADR, and I have not compared my unit with a monitor. Writing that down changed what I let the app claim: "airflow, not CADR", "not compared with a monitor", "my estimate, the official order comes first".
