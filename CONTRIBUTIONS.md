# Contributions

I built this alone, and I used an AI coding assistant for most of the typing. This page says what that means.

## What I did

- **Decided what to build and what not to claim.** I chose the problem (a Delhi family or school that has the air-quality
  numbers but not an answer), the screens, the rules the app must never break (`docs/safety.md`), and the limits on what it
  says: a GRAP stage is our estimate, a reading older than six hours is not used, nothing is called "scientific-grade".
- **Directed and reviewed every change.** The assistant wrote code; I read what it built, ran it, looked at it on screen at a
  phone's width, and sent it back when it was wrong or confusing. I kept the design light and plain, asked for components to be
  reused so screens stay consistent, and refused demo shortcuts: there is no demo mode in the live app, and the recorded days
  uses only real archived data.
- **Ran it on AWS, in my own account.** The stack lives in my account. I put the provider keys (OpenAQ, NASA FIRMS) into
  Secrets Manager myself, from the clipboard, never typed into a chat. Each deploy and site upload was done when I asked for
  it, followed by the smoke check on the live address, and I renewed the OpenAQ key when it was rejected on the last night.
- **Built the cleaner prototype.** I built it step by step (a box, a centrifugal fan, a pleated filter, a foam pre-filter) and
  measured its outlet airflow with a handheld anemometer: about 191 cfm. That is airflow, not CADR, which I have not
  measured (`docs/PURIFIER.md`).
- **Built the measuring unit.** I sourced the parts, wired the Sensirion SPS30 to an ESP32-S3 over UART, and powered and
  tested it on my desk (the firmware was flashed from my machine with the Arduino tools): the serial monitor showed the sensor's readings, I connected the live site to it over
  Bluetooth from Chrome on my Mac, and when it showed "no reading" after the app connected, I reported it and tested the fix on
  the board. I also saw that the first firmware did not match my wiring and had it rewritten.
- **Checked what the app claims.** I asked that every claim be sourced or dropped, which is why `docs/claims.md` lists what we
  do not say (a station's cost, the unit's cost, "ten years", accuracy) until there is evidence.

## What the AI did

- **Claude Code** wrote and tested most of the code, the firmware and the documents in this repository, in long working
  sessions, from my instructions: the app and its tests, the API, the CDK stack, the Hindi answers' framework, the recorded
  week and its recording script, the Bluetooth link, the live chart, and this documentation. Every change went through
  `make prove` (lint, types, 1,255 tests, `cdk synth`, a bundle check) before I accepted it.
- **At run time**, Amazon Bedrock (Nova Micro, behind a guardrail) only rewords answers that fixed rules already decided, and
  every number in its wording is checked. It has no tools and cannot act. Amazon Polly reads answers aloud. See
  `docs/AGENT-BOUNDARIES.md`.

## Where the AI was wrong, and I caught it

- It advised that a particle sensor could be called "reference-grade" and quoted costs with no source. Neither is claimed
  (`docs/claims.md`).
- Its first firmware assumed an I2C wiring on an ESP32 DevKit. My board is an ESP32-S3 wired over UART, so it was rewritten
  for the real wiring, compiled and run.
- The unit's page first repeated the same figures in five cards; I asked for one screen, a chart and the room's numbers side by
  side, then the day and a few insights.
- The unit's chart first drew as a black line, and its first card overflowed on My Air: both were found by looking at my own
  screenshots, then fixed.
- The sensor stopped answering as soon as Bluetooth connected. I saw "no reading" in the app, we read the serial log, and the
  firmware now restarts it. `docs/learning-log.md` lists these and the rest.
