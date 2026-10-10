# As built

What is running, what is built and tested but not switched on, and what is not built.
Checked against the deployed stack and the live address on 10 October 2026.

## Live, and seen working at https://d3lmq1mze2gup3.cloudfront.net

| Part                                                    | State                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The web app (My Air, Exposure, Map, AR Lens, Assistant) | On S3 behind CloudFront, over HTTPS. Reads real data. No demo controls.                                                        |
| Today's air for any place in north India                | Real monitor (name, distance, age) where one reported in the last six hours; otherwise the regional model, labelled Estimate.  |
| Weather, gases, a five-day forecast                     | Open-Meteo, through our API.                                                                                                   |
| History for the Exposure dial                           | The last 14 days of hourly PM2.5, through our API.                                                                             |
| Fires                                                   | NASA FIRMS, through our API, cached.                                                                                           |
| The map's air colours and wind                          | Open-Meteo, read by the browser.                                                                                               |
| The assistant                                           | Fixed rules decide; Nova Micro rewords them behind a guardrail, with a number check; a kill switch; 40 a caller and 500 a day. |
| The request form                                        | Posts to `/v1/requests`: validated, rate-limited, stored with 180 days of expiry, never sent to anyone.                        |
| The harvest (every 15 min)                              | Running.                                                                                                                       |
| Alarms, dashboard, traces                               | Running.                                                                                                                       |
| `make prove`, `make smoke`, CI with secret scanning     | In the repo and passing.                                                                                                       |

## Built and tested, but not live or not used by the app

| Part                                                                        | Why                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Map monitor dots**                                                        | The job that reads about 75 monitors every 30 minutes timed out and was rate-limited by OpenAQ in testing; the fix is committed and was deployed but had not been seen to complete when this was written. The map shows the air colours and fires without the dots until it does. |
| **Telegram alerts** (the loop, links, "did it work?", Hindi voice)          | Built and tested against fakes. Live scheduled sends are off. The app has no screen yet for linking a chat or sending a test alert.                                                                                                                                               |
| **Hindi voice notes (Polly)**                                               | Off by default. The permission is not in the stack.                                                                                                                                                                                                                               |
| **Device messaging** (IoT, the Rooms table, Firehose to S3, Athena queries) | The stack and its tests exist. No device is connected, so the Devices screen shows no readings and says "To be implemented".                                                                                                                                                      |
| **Replay of a past week**                                                   | The API route exists and is tested. The app does not show it.                                                                                                                                                                                                                     |
| **Budget alert by email**                                                   | The stack makes one when given an address; none was given. The account has two $50 budgets made by hand.                                                                                                                                                                          |

## Not built

| Part                                              | State                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **The air monitor and the purifier**              | Not built. Nothing in the app reports a reading from a device. Rules I13 and I16 are not tested on a device. |
| **Real-device readings in Exposure**              | None. Device readings never count, because there are none.                                                   |
| **A rate limit per address at the edge (WAF)**    | Not set up. See `cost.md`.                                                                                   |
| **A second region**                               | None.                                                                                                        |
| **Accounts and sign-in**                          | None. Pins, people and outings are saved on the device only.                                                 |
| **A verified helpline number**                    | Not added.                                                                                                   |
| **The demo** (device frames, scenarios, the tour) | A separate build (`npm run build:demo`), never uploaded to the live address.                                 |

## Checked, not assumed

| Claim                                             | How it was checked                                                                                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The deployed bundle holds no demo or made-up code | `scripts/check-bundle.mjs`, run by `make prove` and by the deploy script before upload.                                                                                                             |
| Every number has where it came from               | The smoke test fails a live answer with no station name, distance or age.                                                                                                                           |
| The assistant uses the model                      | One question through the live page: "Wording by AI, checked against the facts."                                                                                                                     |
| A failure shows as a failure                      | The first live walk showed "No reading right now" on three places. The cause (a model answer with no figure for the hour in progress) was found, fixed, tested, and the cards then showed readings. |

## Things found by testing the live site

Six faults were found by running it, each fixed with a test: a 403 from the `Host` header behind CloudFront, the guardrail refusing our own rewording instruction, a masked-name number slipping the number check, a missing hour in the model's answer, a rate limit on the monitors job, and a deploy that failed on an API setting that named a route before it existed. `LIVE-CHECKLIST.md` lists them.
