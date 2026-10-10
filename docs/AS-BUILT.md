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

## In the app, passing tests, not yet seen on a phone

| Part                     | State                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set-up on My Air         | Three dotted fields for a new person: Home, Work or school (one field), Park. Setting one pins the place and gives Exposure its hours. They can be skipped.                                                                                                                                                                                                                                                            |
| Exposure rings           | Three rings, Home, Work or school, Outdoor. Each hour counts in one ring only (live place, then outdoor, work, school, home). The "i" button opens the guide.                                                                                                                                                                                                                                                          |
| Logging by the assistant | Activity, where (a named place or home, school or work, park) and how long. It asks for what is missing and never guesses a place. No school set: it says so.                                                                                                                                                                                                                                                          |
| Exposure days            | Home counts every hour by default, work or school in its hours, and the hour in progress counts from the first minute. A live fix within a kilometre of a set place counts as being there; further away it counts as outdoors.                                                                                                                                                                                         |
| The round buttons        | Ask and cigarettes are one column at the bottom right of every screen, above any card there. Live location is no longer a button: it is "Detect my location" on My Air (by the search), on the Exposure switch, on the map's card, and in the Lens card's place switch as "Live outdoor location".                                                                                                                     |
| The map                  | Wind, monitors, air colour and fires are always on. One card, centred at the bottom and not foldable, holds the Live label, Detect my location, the colour scale and the notes. The cigarette switch changes the dot numbers and the scale from AQI to cigarettes a day. A press on a flame opens its details and a button to report it.                                                                               |
| Reporting a fire         | From a flame on the map, or by telling the assistant. `POST /v1/fire-reports` keeps the place, the satellite's age and power, and a line of the person's words for 180 days, with a daily limit for each caller and in all. It is read by a person and is not sent to any agency, and the app says so.                                                                                                                 |
| Exposure filters         | Home, Work or School, and Live outdoor location are filters again: one lifts its ring and the hours, the readout and the totals follow it; a second press clears it. Each ring's name is bent round the ring in the gap.                                                                                                                                                                                               |
| Breathe better today     | One section: alerts as a short vertical list, worst first (a severe one, such as a high GRAP stage or a smog day, glows red with a pulsing dotted edge; the rest are soft yellow), then the tips as cards that swipe sideways, each with its reason and its points on a gold coin.                                                                                                                                     |
| Times                    | 12-hour, am and pm, everywhere the app writes a time.                                                                                                                                                                                                                                                                                                                                                                  |
| Where the day is counted | By the timetable (school or work in its hours, otherwise home). A live fix more than a kilometre from every set place counts as being at that place's air instead; with no location, or none allowed, the timetable stands.                                                                                                                                                                                            |
| The cigarette            | Animated wherever it shows: the ember glows and smoke rises, and it holds still for people who ask for less motion.                                                                                                                                                                                                                                                                                                    |
| Fires on the map         | A flame for each FIRMS detection, at every zoom, over the monitor dots. The same fires feed the alerts.                                                                                                                                                                                                                                                                                                                |
| Place cards              | A card in the colour of its air with nothing to open: label, address under it, the AQI (with the cigarettes joined to it as a second tile when that is on), the face, then today and the next two days and the source in the lower half. Narrow cards stack the two tiles and wide ones put them side by side. The Lens card is the same card with one line under the weather: the cleanest daylight hour and its AQI. |

## Built and tested, but not live or not used by the app

| Part                                                                        | Why                                                                                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Telegram alerts** (the loop, links, "did it work?", Hindi voice)          | Built and tested against fakes. Live scheduled sends are off. The app has no screen yet for linking a chat or sending a test alert. |
| **Hindi voice notes (Polly)**                                               | Off by default. The permission is not in the stack.                                                                                 |
| **Device messaging** (IoT, the Rooms table, Firehose to S3, Athena queries) | The stack and its tests exist. No device is connected, so the Devices screen shows no readings and says "To be implemented".        |
| **Replay of a past week**                                                   | The API route exists and is tested. The app does not show it.                                                                       |
| **Budget alert by email**                                                   | The stack makes one when given an address; none was given. The account has two $50 budgets made by hand.                            |

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

## What the air numbers use, and what they leave out

| Factor                              | In the AQI and exposure?                                                                                             | Where it does show                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| PM2.5 (and PM10 for the GRAP guard) | Yes. The AQI is the US formula applied to PM2.5.                                                                     | everywhere                                                          |
| Which place you were in, and when   | Yes. Exposure is the AQI at the place you were, hour by hour, with an assumed indoor share when no monitor is there. | Exposure                                                            |
| Trees, for logged outdoor time      | A small assumed cut, labelled assumed.                                                                               | Exposure                                                            |
| Wind speed and direction            | No. Not in the AQI.                                                                                                  | Shown with the reading; moves the map's wind and the Lens particles |
| Humidity                            | Only in the device verdict (damp air makes optical sensors read high, so "not sure"), which has no device yet.       | Shown with the weather                                              |
| Rain                                | No.                                                                                                                  | Shown in the forecast                                               |
| Temperature                         | No.                                                                                                                  | Shown with the weather                                              |
| Elevation and boundary-layer height | No.                                                                                                                  | Not used anywhere                                                   |

The forecast hours come from the CAMS model, which does include weather in what it predicts, and the app corrects it with the nearest monitor's recent readings. The app itself does not adjust a measured number for weather.

## What the browser asks of Open-Meteo

The wind grid is the one thing the browser still asks Open-Meteo for directly: about 600 points each time the map is opened (a close grid over south Asia and a coarse one worldwide), kept for 30 minutes in the tab. Open-Meteo's free allowance is 10,000 points a day for each address, so a person can open the map about 15 times a day before the wind stops and the map falls back to a sample flow. Moving the wind to our own API (one fetch for everyone, every three hours) would remove that limit; it is not done.
