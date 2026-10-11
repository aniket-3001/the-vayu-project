A Delhi parent opens an air app before school and sees one city number. The nearest monitor may be kilometres from the school. The numbers exist; what is missing is an answer for one place, with the monitor's name, its distance and the reading's age.

The Vayu Project is a free web app that turns those numbers into that decision for a family, school or society in Delhi. No sign-in, no install: add a place (search, or Detect my location) and its card shows today and the next three days: walk, mask, windows. Every number says it is Live (a named monitor, how far, how old), an Estimate (worked out by a regional air model, not read from a monitor) or Measured (my own unit). No advice from a reading over six hours old.

A city average cannot see your room, so I built a small unit (ESP32-S3, Sensirion SPS30 laser sensor) that shows your room's air beside the outside air over Bluetooth.

Live, real data only: https://d3lmq1mze2gup3.cloudfront.net. The recorded days (/#/week) replays seven real days. Fixed rules decide every answer; the AI only puts it into words, and every number it uses is checked against the facts. One command, `make prove`, runs 1,255 tests plus lint, types and the CDK build, and passes. Code: https://github.com/hrsh-kr/vayu-air

Not measured: the unit's accuracy, or my prototype cleaner's CADR (its airflow, about 191 cfm, is not CADR). Bluetooth is tested on Chrome on a Mac only.

---

Facts used

- Persona, six-hour rule, Live or Estimate, no sign-in: `README.md` (opening quote, "Try it in two minutes"), `docs/safety.md` (rules I2, I3), `docs/claims.md`.
- Unit (ESP32-S3, SPS30, Bluetooth): `docs/UNIT.md`, `firmware/vayu-unit/vayu-unit.ino`.
- Real data only, recorded days of seven real days: `README.md` "It is all real data", `docs/claims.md`.
- Rules decide, AI rewords: `docs/safety.md` rule I6, `docs/AGENT-BOUNDARIES.md`.
- 1,255 tests with lint, types and CDK build in `make prove`: `docs/claims.md`, `Makefile`.
- Not built or not measured, Chrome on a Mac only: `docs/AS-BUILT.md`, `docs/claims.md` "Claims we do not make" (Bluetooth row), `docs/UNIT.md`.
