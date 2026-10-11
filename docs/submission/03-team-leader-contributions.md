I built the Vayu Project alone, so every role is mine. Claude Code, an AI coding assistant, wrote most of the code. I decided what to build and reviewed and ran each change. No change was accepted until `make prove` passed: lint, types, tests, cdk synth and a bundle check.

- Product owner. I chose the problem, the screens and what the app may say. Deliverables: the safety rules and the list of claims I refuse to make (`docs/safety.md`, `docs/claims.md`).
- Cloud engineer. The stack runs in my own AWS account. I put the provider keys into Secrets Manager myself, approved each deploy and checked it with the live smoke check, and replaced the OpenAQ key after it was rejected late on 10 October. Deliverables: `infra/lib/`, `docs/architecture.md`, `docs/cost.md`.
- Hardware builder. I sourced the parts, wired the SPS30 to an ESP32-S3 over UART and flashed it. On 11 October the serial monitor showed my room at about 18 to 22 µg/m³ PM2.5, and the live site, connected over Bluetooth from Chrome on my Mac, showed them too. I also built a cleaner prototype; its outlet airflow reads about 191 cfm (airflow, not CADR). Deliverables: `firmware/vayu-unit/`, `docs/UNIT.md`, `docs/PURIFIER.md`.
- Tester. I audit my own screenshots. On 11 October a blog screenshot said AQI 500 beside "GRAP Stage II": the estimate used whatever 24 hours the monitor had, not the last 24, and stretched one hour's PM10 over the day. I had it fixed and checked against the monitors' own PM10 on 24 station-days, with none in the wrong stage. Deliverables: `docs/learning-log.md`, `docs/LIVE-CHECKLIST.md`.

Claude Code's first firmware assumed the wrong wiring, and it suggested calling the sensor reference-grade. I caught both (`CONTRIBUTIONS.md`).

---

Facts used

- Solo, AI assistant, what the AI did and where it was wrong: `CONTRIBUTIONS.md`.
- `make prove` gate: `CONTRIBUTIONS.md` "What the AI did", `docs/claims.md`, `Makefile`.
- Rules and claims ledger: `docs/safety.md`, `docs/claims.md`.
- Own AWS account, keys by clipboard, deploys when asked, smoke check, OpenAQ key renewal: `CONTRIBUTIONS.md` "Ran it on AWS"; `docs/SUBMISSION.md` Honest limits. Idle cost: `docs/cost.md`.
- Unit build, wiring, fix tested on the board: `CONTRIBUTIONS.md` "Built the measuring unit", `docs/UNIT.md`, `firmware/vayu-unit/vayu-unit.ino`.
- Faults found by looking at screenshots: `CONTRIBUTIONS.md` "Where the AI was wrong", `docs/learning-log.md`.
