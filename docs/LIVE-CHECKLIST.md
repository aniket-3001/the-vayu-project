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

| Screen         | What was checked                                                                                                 | Seen |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| My Air         | Four places show a live AQI, the weather, and the nearest monitor's name, distance and age                       | [x]  |
| My Air         | Alerts and tips read the real air and the real fire count                                                        | [x]  |
| My Air Devices | Says "To be implemented", shows no measured numbers, and nothing counts in Exposure                              | [x]  |
| Exposure       | The dial is drawn from the real last 24 hours; hours in each level add up; no unit readings are counted          | [x]  |
| Map            | The air colours and the wind load from Open-Meteo; fire points come from our API                                 | [x]  |
| Map            | Monitor dots appear once the stations job has run                                                                | [x]  |
| Assistant      | A question gets an answer from the rules, reworded by Bedrock, with "Wording by AI, checked against the facts"   | [x]  |
| Assistant      | The answer names the monitor, its distance and its age                                                           | [x]  |
| AIR Lens       | Camera, location and microphone prompts, on a real phone                                                         | [ ]  |
| Request form   | Sending a real request, then reading it in the table                                                             | [ ]  |
| Live location  | The switch is on every screen, is remembered after a reload, and a Here card follows the device                  | [ ]  |
| Detect me      | Asks live or pin with a name; a pinned place keeps its name                                                      | [ ]  |
| Search         | "DAV Public School Sector 49 Gurugram" is found, and shows a reading with its monitor's distance or an Estimate  | [ ]  |
| Voice          | Every answer is read in Kajal's voice; the mic shows listening, then the words, and lets go after a few seconds  | [ ]  |
| AIR Lens       | Particles have a black outline and spray; the colour scale is at the top; the whole scene fits on a laptop       | [ ]  |
| Set-up         | A new profile shows Home, Work or school and Park as dotted fields; setting one puts a card over it              | [ ]  |
| Exposure       | Three rings only; an hour fills one ring; "i" opens the guide card; the centre has only the person icon          | [ ]  |
| Assistant      | "I took a walk" asks where, then how long; "at school" with no school set says to add one on My Air first        | [ ]  |
| Map            | Flames show where the alerts say fires are, and stay at every zoom                                               | [ ]  |
| My Air         | Alerts first, then Breathe better today, then the cards; a card's label is its heading, the address under it     | [ ]  |
| Exposure       | A new home fills the day so far at once, including the hour in progress                                          | [ ]  |
| Buttons        | Ask, cigarettes and live location are in the same column at the bottom right on all four tabs                    | [ ]  |
| Map            | The live-location button drops a blue dot and flies to it; the scale at the top is centred                       | [ ]  |
| Cards          | No arrow on a place card; the cigarettes sit beside the AQI at the same size on cards, Lens and Today            | [ ]  |
| Fire report    | Press a flame on the map, send a report, and find it in the table; or tell the assistant "report a fire"         | [ ]  |
| Exposure       | The three filters lift a ring; the curved names read round each ring                                             | [ ]  |
| Lens           | The card folds; "See it live" and the place switch (with Live outdoor location) are in its top right corner      | [ ]  |
| Map            | One card holds the scale and Detect my location; the cigarette switch turns the dot numbers into cigarettes      | [ ]  |
| My Air         | Alerts sit in Breathe better today: a red one pulses, yellow ones are calm; tips swipe, points are on gold coins | [ ]  |
| My Air         | A place card shows its three days and source with no arrow; the cigarette tile sits under the AQI                | [ ]  |
| Times          | Every time reads in am and pm                                                                                    | [ ]  |
| Assistant      | "log a 30 minute walk" asks where, adds it, and the hour shows in the outdoor ring and the graph's line          | [ ]  |
| Exposure       | The window slides along the day's line; the dial is in am and pm; the person icon is centred                     | [ ]  |
| Lens           | The window slides along the next day and a half and says the AQI of the hour under it                            | [ ]  |
| My Air         | A school's card says where the morning assembly should be; GRAP alerts are yellow, orange, red or purple         | [ ]  |
| Exposure       | A half-hour walk colours half an hour's segment in the outdoor ring and the rest in the ring you were in         | [ ]  |
| My Air         | The points are gold stars, true stars at any width; dots under the tips follow the swipe                         | [ ]  |
| My Air         | With a child and school set, the tips name the school: assembly, GRAP and the child's AQI at school              | [ ]  |
| My Air         | Setting a school asks who goes there; "My child" adds them to the family                                         | [ ]  |
| Exposure       | A school added from Add a person is a card on My Air with the assembly line                                      | [ ]  |
| Assistant      | "When can I walk today?" says indoors when a GRAP stage applies, otherwise the best hour                         | [ ]  |
| My Air         | The first card adds a place; dragging a card moves it and it snaps; the live card glows with LIVE                | [ ]  |
| My Air         | Adding a place asks who it is for                                                                                | [ ]  |
| Map            | The map's colour is grainy at every zoom; wind stays when zoomed in; cigarette symbols show before numbers       | [ ]  |
| GPS            | The GPS button turns location off for the whole app; Detect my location says so while it is off                  | [ ]  |
| AIR Lens       | One card: scale, air, then the 36-hour window with the three buttons                                             | [ ]  |
| My Air         | A tip is its heading; pressing it opens the full words; an alert opens with rain, smog or GRAP specks behind it  | [ ]  |
| My Air         | A card with a GRAP stage wears a glowing GRAP pill in the stage's colour                                         | [ ]  |
| Exposure       | Three labelled lines on the left with the window under them; Your day in the air on the right                    | [ ]  |
| AIR Lens       | The play button runs the 36 hours in five seconds                                                                | [ ]  |
| Laptop         | Every screen at a laptop width                                                                                   | [ ]  |
| Offline        | Switch the phone to airplane mode: the last good readings stay and say how old they are                          | [ ]  |

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

- [ ] `/v1/wind` answers 200 with a few hundred points and `cache-control: public, max-age=1800`; the map's wind arrows then follow real data (and the browser makes no request to api.open-meteo.com for wind).
