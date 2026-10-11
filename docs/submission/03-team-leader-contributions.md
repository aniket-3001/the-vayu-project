I built the Vayu Project alone, so every role is mine. Claude Code, an AI coding assistant, wrote most of the code. I decided what to build, reviewed and ran each change, and made every call on what the app may say. No change was accepted until `make prove` passed: lint, types, tests, cdk synth and a bundle check.

- Product owner. I chose the problem, the screens and what the app may say. Deliverables: the safety rules and the list of claims I refuse to make (`docs/safety.md`, `docs/claims.md`).
- Cloud engineer. The stack runs in my own AWS account. I put the provider keys into Secrets Manager myself, asked for each deploy myself and ran the smoke check on the live address after it, and renewed the OpenAQ key when it was rejected on the last night. Result: the live stack at https://d3lmq1mze2gup3.cloudfront.net. Deliverables: `infra/lib/`, `docs/architecture.md`, `docs/cost.md`.
- Hardware builder. I sourced the parts, wired the SPS30 to an ESP32-S3 over UART and flashed it. On 11 October the serial monitor showed my room at about 18 to 22 µg/m³ PM2.5 every two seconds, and the live site, connected over Bluetooth from Chrome on my Mac, showed the same readings. When it showed no reading once connected, I tested the fix on the board. Deliverables: `firmware/vayu-unit/`, `docs/UNIT.md`.
- Hardware builder, continued. I also built a prototype air cleaner (box, fan, pleated filter, foam pre-filter) and read its outlet airflow at about 191 cfm on an anemometer. That is airflow, not CADR; I have not run the CADR test. Deliverable: `docs/PURIFIER.md`.
- Tester. I used the live site at a phone's width and found faults: a black chart line on the unit's card, and "No reading right now" on three places on the first live walk. Deliverables: `docs/learning-log.md`, `docs/LIVE-CHECKLIST.md`.

The assistant's first firmware assumed the wrong wiring, and it advised calling the sensor reference-grade. I caught both (`CONTRIBUTIONS.md`).
---

Facts used

- Solo, AI assistant, what the AI did and where it was wrong: `CONTRIBUTIONS.md`.
- `make prove` gate: `CONTRIBUTIONS.md` "What the AI did", `docs/claims.md`, `Makefile`.
- Rules and claims ledger: `docs/safety.md`, `docs/claims.md`.
- Own AWS account, keys by clipboard, deploys when asked, smoke check, OpenAQ key renewal: `CONTRIBUTIONS.md` "Ran it on AWS"; `docs/SUBMISSION.md` Honest limits. Idle cost: `docs/cost.md`.
- Unit build, wiring, fix tested on the board: `CONTRIBUTIONS.md` "Built the measuring unit", `docs/UNIT.md`, `firmware/vayu-unit/vayu-unit.ino`.
- Faults found by looking at screenshots: `CONTRIBUTIONS.md` "Where the AI was wrong", `docs/learning-log.md`.
