# What Does Your Project Do?

## The problem

Delhi's air-quality data is abundant. The advice is not.

Every major air-quality app gives you a number for a whole city — a population-weighted average, or a government station in a part of town that is not yours. That number is real. It is also useless for the decision a parent has to make at 8 am: do we walk to school?

On 21 October 2025, the morning after Diwali, the city-wide average in Delhi was AQI 351, putting it in GRAP Stage II — the second of four emergency pollution tiers. But the monitor nearest a home in South Delhi, Lodhi Road, 3.8 km away, read PM2.5 at 980 µg/m³ — that is US AQI 500, the top of the scale, Stage IV. The family living near that monitor was breathing Stage IV air while the official order treated them as Stage II. No existing app surfaced that gap.

## What The Vayu Project does

The Vayu Project is a free web app that takes public air-quality data and converts it into one answer for one named place.

A parent adds "Home" — a street in South Delhi. The app finds the nearest monitor with a reading less than six hours old, names it (Lodhi Road, 3.8 km), shows the AQI (500 on that morning), and gives a verdict: **stay in; wear a well-fitted N95 if you must go out.** A school adds "Assembly Ground." A housing society adds "Rooftop." Each gets its own monitor, its own reading, its own advice.

The decisions the app can make, for each place:
- Walk or stay indoors
- Wear a mask or not (and which grade)
- Keep windows shut or open them
- Hold school assembly inside or on the ground
- What the cleanest hour of the day is (from forecast)
- Whether a stubble-burning plume is approaching (from NASA satellite fire data)
- Which GRAP pollution emergency band applies at this specific location

Every number the app shows carries three things: **where it came from** (the monitor's name), **how far away it is** (in kilometres), and **how old the reading is** (in hours and minutes). A reading older than six hours is dropped, no advice is given, and a regional model estimate is shown instead — clearly labelled as an estimate.

## The rule that governs AI in the app

Air advice can do harm. The app holds one rule: **fixed code decides the advice; AI may only reword it.**

Amazon Bedrock (Nova Micro, behind a content guardrail) receives the rules' answer and the raw facts behind it. It may express the answer in friendlier language. It may not invent a number, soften a warning, or call the air safe when the measured level is not safe. Every number in a reworded answer is verified against the original facts in code — any number that did not come from the facts causes the model's answer to be discarded and the rules' plain text to go out instead. Hindi answers never touch the model at all; they are fixed wording written by a person, with facts inserted.

## The room

Outdoor monitors do not see inside a room. To close that gap, the project includes a measuring unit: an ESP32-S3 microcontroller board wired to a Sensirion SPS30 laser particle counter. It sends an 18-byte packet every two seconds over Bluetooth Low Energy to the app running in the browser. The room's air appears on the main screen beside the outdoor monitor's reading. The unit is labelled a low-cost sensor; its accuracy has not been compared against a reference instrument.

A prototype air cleaner was also built: a centrifugal fan, a pleated filter, and a foam pre-filter in a box, costing about ₹5,000 in parts. Its outlet airflow was measured at approximately 191 cfm. That is airflow — not CADR, which requires a separate smoke-decay test that has not been run.

## Who it is for

Parents deciding whether a child walks to school. Schools deciding whether morning assembly is held indoors. Housing societies deciding whether an outdoor event is wise. All of Delhi and north India, for free, with no installation and no account required.

**Seven real recorded days** — 21 October 2025 (the day after Diwali), 31 October (stubble-burning peak), 9 November (heavy smog), and four others — are available at https://d3lmq1mze2gup3.cloudfront.net/#/week. The app replays each day from 8 am using real archived data, so anyone can see every feature without waiting for a bad day.

## What is not yet done

No pilot has been run. The measuring unit has not been compared with a reference monitor. The cleaner's CADR is unmeasured. No health outcome has been claimed or studied.
