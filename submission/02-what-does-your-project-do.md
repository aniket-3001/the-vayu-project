At 8 am on 21 October 2025, the morning after Diwali, a parent in South Delhi has one question: do we walk to school? The nearest monitor with a fresh reading, Lodhi Road, 3.8 km away, read 500 on the US Air Quality Index (AQI), the top of that scale. PM2.5, the fine particles that reach deep into the lungs, was 980 µg/m³. A city-wide figure cannot answer the parent's question.

**What it does.** The Vayu Project is a free web app that turns public air-quality data into a decision for one named place: a home, a school, a park. Walk or stay in. Mask or not. Windows shut or open. School assembly inside or on the ground. The day's cleanest hour. That morning it said: avoid going out; if you must, go between 4 and 5 pm; wear a well-fitted N95.

**Why you can trust the answer.** Every number names its monitor, the monitor's distance and the reading's age. A reading older than six hours gives no advice. Fixed rules decide every piece of advice; an AI model may only reword it, and any number it writes must be one of the facts. Delhi's pollution stage, GRAP, is one official order for all of NCR. The app shows which GRAP band a place's own air is in, labelled as my estimate, and the official order comes first.

**The room.** A measuring unit I built, an ESP32-S3 board with a laser particle sensor that talks to the browser over Bluetooth, shows your room's air beside the air outside.

**Who it is for.** Delhi parents, schools and housing societies. There is nothing to install. Open https://d3lmq1mze2gup3.cloudfront.net and press "Try without login" to play seven real recorded days.

**Not done yet.** No pilot, and the unit has not been compared with a monitor.
