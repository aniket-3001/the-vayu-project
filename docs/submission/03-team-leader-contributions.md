I built Vayu Air alone, so every role is mine. I used an AI coding assistant (Claude Code) for most of the typing. I directed it, read what it wrote, ran it, and sent it back when it was wrong.

- Product owner. I chose the problem (a Delhi family or school with air numbers but no answer), the screens, and the limits on what the app may say. Deliverables: the safety rules and the list of claims I refuse to make, in `docs/safety.md` and `docs/claims.md`.
- Cloud engineer. I ran the stack in my own AWS account, put the OpenAQ and NASA FIRMS keys into Secrets Manager myself, did each deploy, and renewed the OpenAQ key when it was rejected on the last night. Deliverables: `infra/lib/`, `docs/architecture.md`, `docs/cost.md`.
- Hardware builder. I sourced the parts, wired the SPS30 to an ESP32-S3 over UART, flashed it from my machine, and connected the live site to it over Bluetooth from Chrome. Deliverables: `firmware/vayu-unit/`, `docs/UNIT.md`.
- Tester. I used the live site at a phone's width and found faults: a 403 behind CloudFront, a sensor that stopped after Bluetooth connected, a chart drawn as a black line. Deliverables: `docs/learning-log.md`, `docs/LIVE-CHECKLIST.md`.
- Evidence. The recorded week uses only archived real data, and the unit is never called accurate. Deliverables: `apps/web/src/week`, `scripts/record-week.mjs`.

The assistant's first firmware assumed the wrong wiring, and it advised calling the sensor "reference-grade". I caught both. The full list is in `CONTRIBUTIONS.md`.

An earlier repository, `vayu-labs`, holds the first backend from 5 October. This repository started on 10 October.

---

Facts used
- Solo, AI assistant, what the AI did and where it was wrong: `CONTRIBUTIONS.md`.
- Rules and claims ledger: `docs/safety.md`, `docs/claims.md`.
- Own AWS account, secrets by clipboard, deploys, OpenAQ key renewal: `CONTRIBUTIONS.md` "Ran it on AWS", `docs/SUBMISSION.md` Honest limits.
- Unit build and wiring: `CONTRIBUTIONS.md` "Built the measuring unit", `docs/UNIT.md`, `firmware/vayu-unit/vayu-unit.ino`.
- Faults found by running it: `docs/learning-log.md`.
- Recorded week and its script: `apps/web/src/week`, `scripts/record-week.mjs`, `docs/AS-BUILT.md`.
- Earlier repo and dates: `CONTRIBUTIONS.md` "Earlier work" (marked "confirm against the rules").
