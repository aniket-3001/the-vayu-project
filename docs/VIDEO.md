# The video: what to open, what to show, what to say

Three minutes at most, unlisted on YouTube. The cut below runs about 2 minutes 40 seconds with pauses, so there is room.

## The one idea

One person, one bad morning, one answer. **The morning after Diwali, a parent asks: do we walk to school?** The video shows the app giving that answer for one named place, with the monitor's name, its distance and the age of the reading. Then it shows how it is built on AWS and where it stops.

## How the frameworks shape it

| Framework                                                           | What it decides here                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The playbook (R10, Step 5, Appendix C)                              | The script is the scope. About 400 words at 140 a minute, 3:00 or less, a named person in the first 10 seconds, an AWS console page on screen in every segment (judges treat "AWS must be visible" as a gate), the invariant tested on camera, a before and after, the cost per unit, captions burned in, a real clock. |
| The organizers' proportions                                         | About 20 seconds on the person and the problem, 90 on the thing working, 30 on the architecture, the rest on one failure, what is not built, and what is next.                                                                                                                                                          |
| Jobs: one story, one reveal; say no                                 | One person. One reveal: two places four kilometres apart get two different answers. Close on what is not built. No feature tour.                                                                                                                                                                                        |
| Hormozi: outcome, proof, speed, effort                              | The outcome is a decision. Proof is the live address, the named monitor, the numbers (tests, cents per question). Speed is a few seconds from search to answer. Effort is no sign-in.                                                                                                                                   |
| Thiel: the secret, and start small and real                         | The secret: the numbers exist, but nobody turns them into a decision for one named place with the source and age shown, and a city average cannot see your place or your room. Show it with two real places, then one real room.                                                                                        |
| Paul Graham: plain words, one real person, things that do not scale | Short words, no adjectives that cannot be checked, one real measuring unit on a desk, one cleaner I built by hand.                                                                                                                                                                                                      |

## Run of show

Times are for the cut. "AWS on screen" is the console page to cut to for about 2 seconds.

| #   | Time        | On screen (exactly)                                                                                                                                                                                                                                                                                | Caption (burned in)                                           | AWS on screen                                                                                                                                         |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0:00 – 0:18 | `https://d3lmq1mze2gup3.cloudfront.net/#/week`, chip **21 Oct**, tap the **Home** card. Hold on AQI 500, "Lodhi Road, 3.8 km away · as recorded" and the GRAP Stage IV band alert.                                                                                                                 | "21 Oct 2025, 8 am, South Delhi. Recorded."                   | CloudFront → Distributions → `E307NJQA7AAV9Z`, Enabled                                                                                                |
| 2   | 0:18 – 0:46 | New private window, phone width (390 px): the welcome screen (Sign in, Create an account, Try without login). Sign in to an account you made beforehand; My Air is empty. Search "Dwarka", pick it, name it Home. The card appears. Tap it. Point at the monitor line, the age, the cleanest hour. | "Live. Monitor, distance and age on every number."            | Lambda → `Vayu-ApiFunction…` → Monitor: the invocation spike from the search                                                                          |
| 3   | 0:46 – 1:16 | Back on My Air, tap **See the recorded days** (it opens a new tab). Chip **9 Nov**: Home 424 beside Park 249 (their GRAP pills differ, as per-monitor estimates; the official stage is one for NCR). Chip **31 Oct**, then the **Map** tab: fires and wind.                                        | "Seven real days. Two places, 4 km apart, two answers."       | S3 → site bucket → `assets/recorded-….js`: the recorded days are one file served by CloudFront                                                        |
| 4   | 1:16 – 1:40 | Phone video of the unit on the desk. Chrome on the Mac: **Add device**, **Connect**, the room card and chart (room against outside). Then `docs/images/collage-build.jpg`, then `docs/images/build/airflow-proof.mp4`.                                                                             | "Bluetooth to the phone. No cloud in this path."              | None. Say so in the caption.                                                                                                                          |
| 5   | 1:40 – 2:15 | `docs/architecture-animated.html`, scenes 1 to 5 (Space plays). Cut to the console on each service as it is named.                                                                                                                                                                                 | "One CDK stack, ap-south-1."                                  | X-Ray → Service map; EventBridge Scheduler → `rate(15 minutes)`, retries 0; DynamoDB → Cache → Explore items; Bedrock → Guardrails → `vayu-assistant` |
| 6   | 2:15 – 2:40 | Assistant on the phone: ask "When can I go for a walk?" The answer says "Wording by AI, checked against the facts." Then Systems Manager → Parameter Store → `/vayu/assistant/enabled` → set to `false`. Ask again.                                                                                | "Switch off the model. Same numbers, plain words."            | Systems Manager → Parameter Store → `/vayu/assistant/enabled`                                                                                         |
| 7   | 2:40 – 2:58 | `docs/cost.md` table (idle about $4.50 a month; $0.0008 a question). Terminal: `make prove`, the last line. End card: the live address and the repository.                                                                                                                                         | "1,263 tests. Not built: unit accuracy, CADR, live Telegram." | Billing and Cost Management → Cost Explorer, if it shows a figure; otherwise `docs/cost.md` only                                                      |

## What to say (read it, about 370 words, 2 minutes 40 at an easy pace)

**1. The morning** (18 s)
"8 am, the morning after Diwali. A parent in South Delhi has one question: do we walk to school? The city app says bad. The Vayu Project answers for this place: air quality 500 on the US scale, its ceiling, from the Lodhi Road monitor, three point eight kilometres away. The official pollution stage that day was two, for all of Delhi; this one monitor's air is in the stage four band. The app shows both, and the official order counts. Stay in."

**2. Live** (28 s)
"This is live, on AWS. You can try it without logging in, or sign in with an email, and your places follow you to any device. I search for a place. The card names the monitor, how far it is, and how old the reading is. Past six hours old, it gives no advice, only a labelled estimate. The cleanest hour, a mask, the windows."

**3. Recorded days** (30 s)
"To see a bad day without waiting for one, this button opens seven real days from the public archives, played through the same app. 9 November: on India's scale the last 24 hours averaged 434 at Home and 319 at the park, four kilometres away. A city number cannot see that gap. The stage band is per place; the official stage is one order for all of NCR. 31 October: satellite fires upwind, and the alert before the smoke arrives."

**4. The room and the cleaner** (24 s)
"A city number cannot see your room either. I built a measuring unit, an ESP32 and a laser particle sensor, that sends to the phone over Bluetooth, so your room sits beside the outside air. I also built a cleaner, with five thousand rupees of parts. I measured its airflow, 191 cubic feet a minute. I have not measured its CADR."

**5. The build** (35 s)
"One CDK stack in Mumbai, traced with Powertools for Lambda. CloudFront and S3 serve the app. API Gateway and one Lambda answer. EventBridge Scheduler keeps reference places and the map's monitors fresh in DynamoDB, and a browser never calls the air providers: my API does, and CloudFront caches it. Bedrock, Nova Micro, behind a guardrail, may put an answer in friendly words. Polly reads it aloud. Secrets Manager keeps the keys."

**6. The rule** (25 s)
"The rule: code decides, the model only words. Every number in its wording is checked against the facts. Switch it off in Parameter Store, and the same numbers come out in plain words. A daily cap and this switch keep it near four dollars fifty a month idle, and under a tenth of a cent a question."

**7. What I got wrong, and what is not built** (18 s)
"What I got wrong: my own screenshot showed AQI 500 beside Stage II. The estimate used the wrong 24 hours. It is fixed, and checked against the monitors. Not built yet: the unit's accuracy test, the cleaner's CADR, live Telegram alerts. The Vayu Project, live now."

If the cleaner line (segment 4) runs long, and you want to compare with the Dyson HushJet Purifier Compact, add one sentence: "A Dyson HushJet Purifier Compact launched in India at 29,900 rupees: a price, not a performance claim." Check the current price first, and follow `docs/COMPARISON.md`.

## Before you record

1. **After 05:30 IST.** The assistant's per-caller daily cap (40) is used up from my testing, and it resets at midnight UTC. Before then segment 6 shows the rules answering with "reached its limit", not a Bedrock-worded answer.
2. **Browser, fresh profile and a test account.** Make an account beforehand (it needs an email code), so the video does not wait for one. The account's My Air must be empty, so the **See the recorded days** button shows. Phone width: DevTools device toolbar at 390 × 844, or mirror a real phone.
3. **Tabs, in order.**
   - A: the live site (empty My Air).
   - B: `https://d3lmq1mze2gup3.cloudfront.net/#/week`.
   - C: `docs/architecture-animated.html`.
   - D: the AWS console in `ap-south-1` (Mumbai), one tab per page in the table: CloudFront, Lambda, S3, X-Ray, EventBridge Scheduler, DynamoDB, Bedrock, Systems Manager.
4. **Console hygiene.** Never open a secret's value. Parameter Store: open only `/vayu/assistant/enabled`. The account number shows in the console header; blur it in the edit if you prefer.
5. **The switch takes up to 60 seconds** to bite: the API keeps the value for a minute. In segment 6, flip it to `false` first, wait a minute (cut the wait), then ask. **Set it back to `true` straight after**, and ask once to confirm.
6. **Hardware clips.** Have the unit connected before you start; Bluetooth works in Chrome on a Mac only. Keep a 10-second recorded clip as a fallback in case it will not connect.
7. **Format.** 1080p, burned-in captions, the real clock, no edited timestamps. Record each segment as its own clip so a retake costs one clip.

## Do not say

- What the unit costs, or what a station costs (no source: `docs/claims.md`).
- "Accurate", "reference-grade" or "agrees with a monitor" about the unit.
- That the cleaner works, or that 191 cfm beats the Dyson's CADR. It is airflow, and CADR is a different number.
- That a GRAP stage is official, or that a school is closed. The app shows which band a place's own air is in; the official order is one for all of NCR (on 21 Oct it was Stage II).
- A claim that sign-in was tried by anyone but you. Do it yourself once before recording.
- Anything about Telegram except "not built yet" (it is built and tested against fakes; live sends are off).
- That the assistant answers every question with the model. Fixed rules decide the advice; the model words it, or answers a question no rule covers from the facts it is given.

## After

Upload unlisted, open the link signed out on a phone, check the captions, and put the link in the README and the form.
