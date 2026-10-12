# Contributions

I built the Vayu Project solo, with Claude (Anthropic's AI coding assistant, through Claude Code) helping with the typing. I chose the problem and the rules, directed the work, read and ran every change, built the hardware, and deployed and checked it on AWS. This page says what I did and what the AI did.

## AI assistance

I directed Claude to write code and documentation, and every change was mine to accept or send back. Many commits carry its co-author line. It had no access to my AWS account: I ran every deploy and put the keys in Secrets Manager myself. I decided what the app may say, and no change was accepted until `make prove` passed. It was wrong in ways I caught (see "Faults I caught"). The app itself uses Amazon Bedrock (Nova Micro) and Amazon Polly at run time, described in `docs/AGENT-BOUNDARIES.md`.

## What I did

- **Decided what to build and what not to claim.** I chose the problem (a Delhi family or school that has the air-quality
  numbers but not an answer), the screens, the rules the app must never break (`docs/safety.md`), and the limits on what it
  says: a GRAP stage is our estimate, a reading older than six hours is not used, nothing is called "scientific-grade".
- **Reviewed and ran every change.** I read each change, ran it, looked at it on screen at a phone's width, and sent it back
  when it was wrong or confusing. I kept the design light and plain, kept components shared so screens stay consistent, and
  refused demo shortcuts: there is no made-up data in the live app, and the recorded days use only real archived data. Every
  change went through `make prove` (lint, types, 1,285 tests, `cdk synth`, a bundle check) before I accepted it.
- **Ran it on AWS, in my own account.** The stack lives in my account. I put the provider keys (OpenAQ, NASA FIRMS) into
  Secrets Manager myself, from the clipboard, never typed into a chat. Each deploy and site upload was done when I asked for
  it, followed by the smoke check on the live address, and I replaced the OpenAQ key after it was rejected late on 10 October.
- **Built the cleaner prototype.** I built it step by step (a box, a centrifugal fan, a pleated filter, a foam pre-filter) and
  measured its outlet airflow with a handheld anemometer: about 191 cfm. That is airflow, not CADR, which I have not
  measured (`docs/PURIFIER.md`).
- **Built the measuring unit.** I sourced the parts, wired the Sensirion SPS30 to an ESP32-S3 over UART, and powered and
  tested it on my desk (the firmware was flashed from my machine with the Arduino tools): the serial monitor showed the
  sensor's readings, I connected the live site to it over Bluetooth from Chrome on my Mac, and when it showed "no reading"
  after the app connected, I tested the fix on the board.
- **Checked what the app claims.** Every claim is sourced or dropped, which is why `docs/claims.md` lists what we do not say
  (a station's cost, the unit's cost, "ten years", accuracy) until there is evidence.

## What the app does at run time

Amazon Bedrock (Nova Micro, behind a guardrail) rewords answers that fixed rules already decided, or answers a question no
rule covers from the facts it is given. Every number in its wording is checked against the facts, and it has no tools and
cannot act. Amazon Polly reads answers aloud. See `docs/AGENT-BOUNDARIES.md`.

## Faults I caught

- An early draft called a particle sensor "reference-grade" and quoted costs with no source. Neither is claimed
  (`docs/claims.md`).
- The first firmware assumed an I2C wiring on an ESP32 DevKit. My board is an ESP32-S3 wired over UART, so it was rewritten
  for the real wiring, compiled and run.
- The unit's page first repeated the same figures in five cards; I asked for one screen, a chart and the room's numbers side by
  side, then the day and a few insights.
- The unit's chart first drew as a black line, and its first card overflowed on My Air: both were found by looking at my own
  screenshots, then fixed.
- The sensor stopped answering as soon as Bluetooth connected. I saw "no reading" in the app, I read the serial log, and the
  firmware now restarts it.
- On 11 October my own screenshot showed AQI 500 beside "GRAP Stage II". The estimate used the last 24 hours the monitor had,
  not the last 24 hours, and stretched one hour's PM10 over the day. It is fixed and checked against the monitors' own PM10
  on 24 station-days: 22 landed in the same stage as the monitor's own index and 2 had no estimate (too few recent hours). `docs/learning-log.md` lists these and the rest.
