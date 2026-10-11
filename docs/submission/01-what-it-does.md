A Delhi parent opens an air app before school and sees one city number. The nearest monitor may be kilometres from the school. What is missing is an answer for one place, with the monitor's name, its distance and the reading's age.

The Vayu Project is a free web app that turns those numbers into that decision for a family, school or housing society in Delhi. No sign-in, no install: add a place (search, or Detect my location) and its card shows today and the next two days: walk, mask, windows. Every number names its source: a monitor with its distance and age, a regional model, or my own unit. A reading over six hours old gives no advice.

A city average cannot see your room, so I built a small unit (ESP32-S3, Sensirion SPS30 laser sensor) that shows your room's air beside the outside air over Bluetooth.

Live, real data only: https://d3lmq1mze2gup3.cloudfront.net. The recorded days (/#/week) replay seven real days. On 21 Oct 2025, the day after Diwali, Home read AQI 500 (the US scale) from the Lodhi Road monitor 3.8 km away, and the app said: avoid going out, and GRAP Stage IV (Delhi's emergency pollution stage) is likely, by our estimate, not an order. Fixed rules decide the advice; the AI only words it, and any number not in the facts is thrown out. 1,253 tests pass in one command, `make prove`.

Not measured yet: the unit's accuracy against a monitor. Bluetooth is tested only in Chrome on a Mac.

---

Facts used

- Persona, six-hour rule, Live or Estimate, no sign-in: `README.md` (opening quote, "Try it in two minutes"), `docs/safety.md` (rules I2, I3), `docs/claims.md`.
- Unit (ESP32-S3, SPS30, Bluetooth): `docs/UNIT.md`, `firmware/vayu-unit/vayu-unit.ino`.
- Real data only, recorded days of seven real days: `README.md` "It is all real data", `docs/claims.md`.
- Rules decide, AI rewords: `docs/safety.md` rule I6, `docs/AGENT-BOUNDARIES.md`.
- 1,253 tests with lint, types and CDK build in `make prove`: `docs/claims.md`, `Makefile`.
- Not built or not measured, Chrome on a Mac only: `docs/AS-BUILT.md`, `docs/claims.md` "Claims we do not make" (Bluetooth row), `docs/UNIT.md`.
