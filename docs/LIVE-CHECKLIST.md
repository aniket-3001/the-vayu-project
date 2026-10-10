# Live checklist

The address: https://d3lmq1mze2gup3.cloudfront.net (the `SiteUrl` output of the `Vayu` stack, ap-south-1).

`make smoke LIVE_URL=<address>` runs the data and header checks. This list is what a person checks by hand.
Ticked means seen working on the live address on 10 Oct 2026, on a phone-sized screen in the built-in browser.
Unticked means not yet seen live.

## Checked by the smoke test

- [x] The page is served, with the security headers (HSTS, no framing, content policy)
- [x] The API under the same address answers, with the same headers and a `cache-control`
- [x] A repeated answer is kept by CloudFront
- [x] Today, history, fires, replay and rooms answer for the four places, a place in Noida and one in Lucknow
- [x] Bad input is refused with a reason: unknown place, out-of-range history, outside north India, bad room name, invalid request form
- [x] Every answer says where its numbers come from and how old they are
- [x] A model-only answer has a figure for the hour in progress
- [x] Monitors for the map: 68 monitors in the list after the first complete run of the stations job

## Checked by hand

| Screen         | What was checked                                                                                                | Seen |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ---- |
| My Air         | Four places show a live AQI, the weather, and the nearest monitor's name, distance and age                      | [x]  |
| My Air         | Alerts and tips read the real air and the real fire count                                                       | [x]  |
| My Air Devices | Says "To be implemented", shows no measured numbers, and nothing counts in Exposure                             | [x]  |
| Exposure       | The dial is drawn from the real last 24 hours; hours in each level add up; no unit readings are counted         | [x]  |
| Map            | The air colours and the wind load from Open-Meteo; fire points come from our API                                | [x]  |
| Map            | Monitor dots appear once the stations job has run                                                               | [x]  |
| Assistant      | A question gets an answer from the rules, reworded by Bedrock, with "Wording by AI, checked against the facts"  | [x]  |
| Assistant      | The answer names the monitor, its distance and its age                                                          | [x]  |
| AR Lens        | Camera, location and microphone prompts, on a real phone                                                        | [ ]  |
| Request form   | Sending a real request, then reading it in the table                                                            | [ ]  |
| Live location  | The switch is on every screen, is remembered after a reload, and a Here card follows the device                 | [ ]  |
| Detect me      | Asks live or pin with a name; a pinned place keeps its name                                                     | [ ]  |
| Search         | "DAV Public School Sector 49 Gurugram" is found, and shows a reading with its monitor's distance or an Estimate | [ ]  |
| Voice          | Every answer is read in Kajal's voice; the mic shows listening, then the words, and lets go after a few seconds | [ ]  |
| AR Lens        | Particles have a black outline and spray; the colour scale is at the top; the whole scene fits on a laptop      | [ ]  |
| Laptop         | Every screen at a laptop width                                                                                  | [ ]  |
| Offline        | Switch the phone to airplane mode: the last good readings stay and say how old they are                         | [ ]  |

## What changed on the way (each found by looking, then fixed and tested)

1. The API was refused with 403 behind CloudFront, because the viewer's `Host` header was forwarded to API Gateway.
   Now only the viewer address is forwarded.
2. The assistant never used the model: the guardrail's prompt-attack filter blocked our own rewording instruction.
   The instruction is now the system prompt.
3. A masked name such as `[person 1]` counted as the allowed number 1.
   It no longer counts as a number.
4. Places outside a monitor's range showed "No reading right now": the regional model's answer left out the hour in progress.
   It is kept now, and an estimate is cached for one minute instead of five.
5. The map's monitor job ran into OpenAQ's rate limit, and also took longer than its two-minute limit. It now waits as long as OpenAQ asks, up to three times a run, starts requests a fixed time apart, and stops at a time budget.
6. The first deploy failed on an API stage setting that named a route before it existed, and the rollback failed too.
   The stage now waits for its routes.
