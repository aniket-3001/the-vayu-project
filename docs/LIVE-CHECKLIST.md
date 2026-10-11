# Live checklist

The address: https://d3lmq1mze2gup3.cloudfront.net (the `SiteUrl` output of the `Vayu` stack, ap-south-1).

This list says, row by row, what has been seen working on the live address, by whom, and what has **not** been checked. It is a current-state list: every row is about the app as it is now.

- **Smoke test** (`make smoke LIVE_URL=<address>`): the data, the rules and the headers.
- **Scripted browser run** (`tests/live-check/`): headless Chrome drives the live site at a phone's width (390 px) and a laptop's (1280 px). Run on 12 Oct 2026, after the last deploy.
- **By the owner**: on real hardware, 11 Oct 2026.
- **Not checked**: needs a real phone or a person. Listed at the end, not ticked.

Headless Chrome is not a phone. A pass here means the page did the right thing in Chrome; it does not mean it was seen on an iPhone or an Android phone.

## Smoke test

- [x] The page is served, with the security headers (HSTS, no framing, content policy)
- [x] The API under the same address answers, with the same headers and a `cache-control`
- [x] A repeated answer is kept by CloudFront
- [x] Today, history, fires, replay and rooms answer for the four places, a place in Noida and one in Lucknow
- [x] Bad input is refused with a reason: unknown place, out-of-range history, outside north India, bad room name, invalid request form, a fire report off the Earth
- [x] Every answer says where its numbers come from and how old they are
- [x] The assistant answers from the facts it was given, and refuses a made-up fact
- [x] Monitors for the map: about 7,260 in the list

## Scripted browser run, at 390 px and at 1280 px

| Screen        | What was checked                                                                                                                                                                                          | Seen |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| My Air, empty | A link "See the recorded days" that opens `/#/week` in a new tab; Home, Work or school and Park as dotted fields                                                                                          | [x]  |
| Search        | "DAV Public School Sector 49 Gurugram" is found, asks what to call it, asks who it is for, and becomes a card                                                                                             | [x]  |
| My Air        | Each card shows the AQI, the weather, and the nearest monitor's name, distance and age                                                                                                                    | [x]  |
| GPS switch    | Turns off, is remembered after a reload, and turns back on; with it off, Detect my location says GPS is off                                                                                               | [x]  |
| Detect me     | With a position given, offers a named pin or "Follow me instead (live location)"                                                                                                                          | [x]  |
| Cigarettes    | The switch changes the scale and the numbers to cigarettes a day                                                                                                                                          | [x]  |
| A place page  | Insights for this place, the hourly forecast and the air pollutants; the monitor's name, distance and age                                                                                                 | [x]  |
| Exposure      | The day as lines with Auto calculate, and Your day in the air                                                                                                                                             | [x]  |
| Map           | Draws, with the scale and the Live label                                                                                                                                                                  | [x]  |
| Fire report   | On the recorded 31 Oct map: pressing a flame opens its popup; Report this fire opens a sheet with the coordinates, Copy location, Open in maps, Call 112 and Call 101, and says the app contacts no one   | [x]  |
| AIR Lens      | Opens with the scale, the air and the 36-hour window; "Experience on camera" does not break it when there is no camera                                                                                    | [x]  |
| Times         | No 24-hour time on My Air, a place page, Exposure or the Lens                                                                                                                                             | [x]  |
| Width         | No sideways scroll on My Air, a place page, Exposure, the Map or the Lens, at either width                                                                                                                | [x]  |
| Assistant     | A walk question gets an answer that names the monitor, its distance and its age, and says "Wording by AI, checked against the facts"                                                                      | [x]  |
| Assistant     | "log a 30 minute walk" asks where, then logs it at Home and points to Exposure, with the time in am and pm                                                                                                | [x]  |
| Assistant     | In Hindi: the chat, a Hindi question and Hindi typed in Latin letters all get a Hindi answer, with the monitor and its age                                                                                | [x]  |
| Voice         | `POST /v1/speech` returns a new Polly (Kajal) MP3 for new words; in Chrome with autoplay allowed the page plays it. Headless Chrome blocks autoplay, so by default the page says the voice is unavailable | [x]  |
| Offline       | With the network switched off after loading, the last good readings stay, with their age, and moving between tabs works. A reload while offline was not tried                                             | [x]  |
| Recorded days | `/#/week` opens; all seven days load with their tips and alerts; the place page says the hours after the moment are hindsight                                                                             | [x]  |
| Console       | No errors in the browser console during the run                                                                                                                                                           | [x]  |

## By the owner, on real hardware (11 Oct)

| Screen    | What was checked                                                                                                                                                                  | Seen |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Your room | With the real unit on (ESP32-S3 and SPS30), Add device, Connect over Bluetooth in Chrome on a Mac: the reading moves every two seconds, and Reconnect device brings readings back | [x]  |

## Not checked

These need a real phone, a real person or the unit, and were not done:

- [ ] AIR Lens on a phone, with the camera, location and microphone permission prompts
- [ ] The microphone: it listens, shows the words and sends them (English and Hindi)
- [ ] The voice heard by ear on a phone (the audio is checked, not the listening)
- [ ] Sending a real request through the request form, and reading it in the table (the smoke test only checks that a bad form is refused and nothing is stored)
- [ ] Android Chrome and iPhone Safari at all (Bluetooth does not work on iPhone Safari)
- [ ] The phone in airplane mode, and a reload while offline
- [ ] The Your room page with the unit connected: the room against outside, the gap, the purifier-on test, and the day by hour
- [ ] An hour the unit measured counts in Exposure as measured
- [ ] Wind: that the browser makes no request to api.open-meteo.com or api.met.no for wind. `/v1/wind` answering 200 with `cache-control: public, max-age=1800` is checked by the smoke test's cache check, not separately.

## What was found on the way (each fixed and tested)

1. The API was refused with 403 behind CloudFront, because the viewer's `Host` header was forwarded to API Gateway. Now only the viewer address is forwarded.
2. The assistant never used the model: the guardrail's prompt-attack filter blocked our own rewording instruction. The instruction is now the system prompt.
3. A masked name such as `[person 1]` counted as the allowed number 1. It no longer counts as a number.
4. Places outside a monitor's range showed "No reading right now": the regional model's answer left out the hour in progress. It is kept now, and an estimate is cached for one minute instead of five.
5. The map's monitor job ran into OpenAQ's rate limit and took longer than its two-minute limit. It now waits as long as OpenAQ asks, starts requests a fixed time apart, and stops at a time budget.
6. The first deploy failed on an API stage setting that named a route before it existed, and the rollback failed too. The stage now waits for its routes.
7. A screenshot showed AQI 500 beside "GRAP Stage II": the estimate used the last 24 hours the monitor had, not the last 24 hours, and stretched one hour's PM10 over the day. Fixed and checked against the monitors' own PM10.
8. In the browser run on 12 Oct, a model-worded answer contained "[Place] has good air quality" at AQI 61: the model had capitalised a masked-name placeholder, which was not put back, and it called a Moderate level "good". Now a placeholder is put back whatever its case, and an answer that calls the air good or clean when the level is not Good is refused.
9. The same run showed a logged walk reading "from 00:50": a 24-hour time. It now reads in am and pm.
10. Questions a person actually types went to the wrong answer: "Should my kid wear a mask outside?" got the school answer, "windows open in this urban smog?" got the alerts answer (the "ban" in "urban"), and "aaj bahar jaana theek hai?" matched nothing. Whole-word matching, mask and windows ahead of school, and common Hindi in Latin letters are in, with each phrase as a test. Checked on the live assistant.
11. The request form said "we will get back to you", but nothing reads the table. It now says no one is notified automatically.
