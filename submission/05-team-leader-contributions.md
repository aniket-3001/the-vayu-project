I built this solo, with Claude (Anthropic's AI coding assistant) as a coding assistant. I chose the problem and the rules, read and ran every change, built the hardware, and deployed and checked everything on AWS myself.

**Product.** I decided what the app may and may not say: rules decide the advice and the model only words it, checked in code; a reading older than six hours gives no advice; a GRAP band is always my estimate and a school is only ever "likely" closed. I rebuilt seven real past days from public archives, cleaned with two written rules, so anyone can test the app without an account.

**Cloud.** One CDK stack in my own AWS account: CloudFront, S3, API Gateway, Lambda, DynamoDB, EventBridge Scheduler, Bedrock with a Guardrail, Polly, Cognito, Secrets Manager and CloudWatch. I priced it from AWS list prices before setting the caps (about $4.50 a month idle, $0.0008 a question) and measured the live API: a median 1.5 s in Lambda on a fresh lookup (p99 5.2 s), about 0.15 s from CloudFront on a repeat.

**Hardware.** I wired a Sensirion SPS30 particle sensor to an ESP32-S3 and wrote the 186 lines of firmware that send a Bluetooth packet every 2 seconds. On 11 October it showed my room at 18 to 22 µg/m³ PM2.5, on the serial monitor and on the live site. I also built a cleaner prototype from about ₹5,000 of parts and measured its outlet airflow at about 191 cfm. That is airflow, not CADR.

**Testing.** 1,285 automated tests, with lint, strict types and `cdk synth`, in one command. My own screenshot showed AQI 500 beside "GRAP Stage II". I traced the bug, fixed it, and checked the fix against the monitors' own readings on 24 station-days: 22 matched, 2 had too little data.
