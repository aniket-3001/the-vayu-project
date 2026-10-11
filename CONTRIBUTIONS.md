# Contributions

Who did what, and how AI was used. The sections for each person are theirs to write, in their own words, about their own
work: specific modules, what they decided, what they got wrong and fixed. The lines marked **(confirm)** are the team's
to check before this is sent.

## How the work was split (confirm)

| Person               | Parts                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| Aniket **(confirm)** | The API, the web app, the alert loop and the AWS stack: `apps/api`, `apps/web`, `packages/*`, `infra/`        |
| Harsh **(confirm)**  | The measuring unit: parts, wiring, assembly, flashing and bench testing; `firmware/vayu-unit`, `docs/UNIT.md` |

The git history does not show this split: every commit in this repository carries one identity, because the code was
committed from one machine. Ownership is therefore stated here, not read from `git log`.

## Aniket **(to write)**

What I built, what I decided, what broke and how I found it, what I would change.

## Harsh **(to write)**

What I built and tested on the bench: the wiring of the SPS30 to the ESP32-S3 over UART, what the serial monitor showed,
the fault where the sensor stopped answering once the app connected (and what I saw), what I would test next.

## How AI was used

- **Claude Code** wrote and tested most of the code, the firmware and the documents in this repository, from the team's
  direction, in a long working session: the team set what to build, read and ran what came back, and tested it on the live
  address and, for the unit, on the real board. The AI did not choose the rules in `docs/safety.md` alone; the team set them,
  and the AI wrote the tests that hold them.
- **Where the AI was wrong and the team caught it**, for example: advice that a sensor was "reference-grade" (removed; see
  `docs/claims.md`), a firmware that assumed an I2C wiring the team had not used (rewritten for the real UART wiring), and a
  sensor that stopped answering after Bluetooth connected (found from the serial log, then fixed).
- **At run time**, Amazon Bedrock (Nova Micro, behind a guardrail) only rewords answers the rules already decided, and every
  number in its wording is checked. It cannot act. See `docs/AGENT-BOUNDARIES.md`.
- **Claims** the AI suggested that no one could source (a station's cost, the unit's cost, a ten-year rating) are not made.
