A parent in Delhi opens an air app before school and sees one city number. The nearest monitor may be kilometres from the school, and the assembly is in the open. The numbers exist. Nobody turns them into a decision for one place.

Vayu Air is a free web app that does, for a Delhi family, school or society. You set the places you care about: home, school, work, a park. Each place gets a short answer for today and the next three days: walk, mask, windows. Every number says whether it is Live (a named monitor, how far, how old) or an Estimate (a regional model). Nothing is advised from a reading older than six hours.

A city average cannot see your room. So I built a small unit, an ESP32-S3 with a Sensirion SPS30 laser sensor, that connects over Bluetooth and shows your room's air beside the air outside.

It is live on real data only: https://d3lmq1mze2gup3.cloudfront.net. A recorded week at /#/week replays seven real days from public archives, labelled recorded. Fixed rules decide every answer. AI only rewords it, and a number not in the facts is never shown. 1,243 tests run in one command.

Not built: the air purifier. The unit's accuracy is not measured. Telegram alerts are built, but live sending is off.

---

Facts used
- Persona, six-hour rule, Live or Estimate: `README.md` (opening quote), `docs/safety.md` (rules I2, I3), `docs/claims.md`.
- Unit (ESP32-S3, SPS30, Bluetooth): `docs/UNIT.md`, `firmware/vayu-unit/vayu-unit.ino`.
- Real data only, recorded week of seven real days: `README.md` "It is all real data", `docs/claims.md`.
- Code decides, AI rewords, unlisted number never shown: `docs/safety.md` rule I6, `docs/AGENT-BOUNDARIES.md`.
- 1,243 tests in `make prove`: `docs/claims.md`, `Makefile`.
- Not built or not measured (purifier, accuracy, Telegram sends off): `docs/AS-BUILT.md`, `docs/claims.md` "Claims we do not make".
