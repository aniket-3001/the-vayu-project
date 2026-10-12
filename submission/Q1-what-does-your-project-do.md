**The problem.** At 8 am on 21 October 2025, the morning after Diwali, a parent in South Delhi has one question: do we walk to school? Delhi has plenty of air-quality numbers, and none of them answers that. A city-wide figure cannot see one street, and the nearest monitor may be kilometres away and hours old. That morning the nearest monitor with a fresh reading, Lodhi Road, 3.8 km from the home I used, read PM2.5 at 980 µg/m³. That is 500 on the US Air Quality Index (AQI), the top of the scale. The official pollution stage for all of Delhi-NCR, GRAP (the Graded Response Action Plan), was Stage II.

**What it does.** The Vayu Project is a free web app that turns public air-quality data into a decision for one named place: a home, a school, a park. Walk or stay in. Mask or not. Windows shut or open. School assembly inside or on the ground. The day's cleanest hour. Replayed at 8 am, it says: avoid going out, and wear a well-fitted N95 if you must.

**Why you can trust the answer.**

- Every number names its monitor, the monitor's distance and the reading's age. A reading older than six hours gives no advice; the card shows an estimate from a regional model and says so.
- A GRAP stage is never presented as an order. The app shows which GRAP band a place's own air is in, labelled as my estimate, and the official order comes first.
- Fixed rules decide the advice. An AI model (Amazon Bedrock) may reword it, or answer a question no rule covers from the facts it is given. Code checks every number it writes against those facts, and on any doubt the rules' own text goes out. Hindi answers never reach the model.

**The room.** Outdoor monitors cannot see inside a room, so I built a measuring unit: an ESP32-S3 board with a Sensirion SPS30 laser particle sensor that talks to the browser over Bluetooth. It shows the room's air beside the air outside.

**Who it is for, and what changes.** Delhi parents, schools and housing societies, free, with nothing to install.

- On 21 Oct, the app names the monitor and its distance and shows the official order beside its own estimate (the band for that place's air was IV).
- On 9 Nov, two places 4 km apart averaged 434 and 319 on India's scale over 24 hours: the Stage III and Stage II bands. A city number hides that gap.
- On 31 Oct, the app counted 85 satellite fire detections near Home or upwind within 300 km, and warned that smoke could arrive.

"Try without login" plays seven real recorded days, from the public archives, as if it were 8 am on each: https://d3lmq1mze2gup3.cloudfront.net/#/week. The hours after 8 am are what was recorded next, so the days show the features, not forecast skill.
