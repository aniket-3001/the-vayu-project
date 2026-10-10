# Vayu Air: design brief (version 2)

One page plus a table. Every screen follows it. If something here is wrong, change it here first.

## The idea

A hybrid, with a clear base. **Start from IQAir's design and colour scheme, then iterate** element by element. Around that base, each piece comes from the app that does it best. The one thing none of them has, and the thing we add, is **provenance**: every number says where it came from and how old it is. That is our signature, not decoration.

## Where each element comes from

| Element | Taken from | How we use it |
| --- | --- | --- |
| **Base look and colour scheme** | IQAir | Light page, soft wash of the current air colour at the top, one status card in that colour with the number, main pollutant and weather chips, rounded cards, clean sans. Our starting point; we change what we want from here. |
| **Overall flow** | Halo Weather (Apple Weather's structure) | Places list, then a place's page (hero, hourly, daily, details), with the map one tap away. |
| **Hero** | Good Air | A clear gradient hero that follows the AQI band, with the number large over it and one human sentence beneath. |
| **Interactive map** | Windy | A full-screen map with a time scrubber, nearby monitors as AQI bubbles (with distance and age), and a wind layer. A mode you open, never the home screen. |
| **Graphs and presentation** | CARROT Weather | The hourly and daily charts: clear, labelled, a little characterful, never a wall of numbers. |
| **Air Lens** | Sunlitt | A camera view with the air drawn over it, plus a time dial: drag the dial and watch the haze and the wind path change through the day. Like Sunlitt's sun path, but for air and wind. |
| **Personality** | Not Boring Weather, in a small dose | Confident numerals and one tactile touch in the World. Plain and quiet on a bad-air day. No jokes about health. |
| **Voice** | JARVIS | Warm, plain, composed, exact, slightly dry. See Voice. |

What we leave out: Windy's density, AQI's clutter, Halo's ads and weekly subscription, Not Boring's low contrast, frosted-glass cards copied from Apple, and the template hero (centred headline, one glowing gradient word, two buttons, three tiles).

## Look (the starting point, to be iterated)

- **Colour.** Near-white page, greyed-slate text. The only saturated colours are the six US AQI bands (green, yellow, orange, red, purple, rose-plum), contrast-checked to 4.5:1 for text. The wash is the band at about 14%, fading to the page colour by the lower third. There is no dark mode: light feels more trustworthy and inviting. Where something has to be dark, it is a greyed slate (`#334155`), never navy or black, and only where contrast needs it. A warmer "paper" page colour is an iteration option, not the default.
- **Type.** Hanken Grotesk (open source, self-hosted) for everything. Tabular numerals for any figure that changes. Big numerals are the main character of each screen. A serif for the numerals (Instrument Serif) is an iteration option to try once the base works.
- **Shape and space.** Rounded cards on the page, a hairline or a very light shadow, an 8-point grid, one large thing per screen.
- **Hero.** A gradient built from the current band, fixed at the top while the page scrolls under it, with the live number, the place, and the source line ("Anand Lok, 4 km away · 65 min ago · live").

## Motion

Motion explains; it never decorates. Every animation answers "what just changed?".

- The hero gradient cross-fades to the new band over 700 ms when the place or hour changes.
- The big number settles to its value once per load (600 ms). Hourly bars rise in sequence.
- Scrubbing the time moves the number, the gradient and the map together, with no lag.
- The map, Lens and World are the places for continuous motion; it pauses when the tab is hidden.
- `prefers-reduced-motion`: no counting or sequencing, cross-fades only.
- Libraries: Motion for interface motion, three.js and three.quarks for the World and Lens. Nothing hand-rolled when a library exists.

## Voice

Warm and plain, with the composure of JARVIS: calm, courteous, exact, slightly dry. It says what it knows, how sure it is, and what it would do. It never gushes, never panics, never jokes about your health, and goes quieter and plainer as the air gets worse.

1. **Lead with the answer.** "A good hour for a walk: 5 to 6 pm." Then the reason.
2. **One sentence where one will do.** Every figure has a unit, a source and an age.
3. **Say "not sure" plainly**, with why.
4. **Dry, once, and only when the news is not bad.** Never on a severe day.
5. No "I", no exclamation marks, no emoji, no "oops", "unlock", "seamless", "empower".
6. **Never claim what we have not measured.** "Assumed", "a model", "a made-up day", "our estimate".

| Moment | Words |
| --- | --- |
| Good hour | A good hour for a walk: 5 to 6 pm. Air stays under US AQI 100. |
| No clean hour | No clean hour outside today. If you can stay in, do. |
| Severe | The air is hazardous until about 9 pm. Keep windows shut, and keep children in. |
| No reading | No recent reading near here. We won't guess. |
| Loading | Checking the monitors nearby… |
| Forecast | Our estimate, not a measurement. |
| Simulation | Made-up day. The air is a model; the blocks only draw it. |
| Alert | Unofficial: this is our estimate, not an order. |

Every string goes through the `humanizer` skill before it ships.

## Honesty is part of the design

`Live`, `Estimate`, `Model`, `Sample data`, `Made-up day`, `Assumed` each have one fixed place and one fixed style: small, quiet, a hairline pill. They are never removed to make a screen cleaner. Official orders always come first, and this is not medical advice.

## Banned

Purple-to-blue gradients, glow, glass and blur, centred hero over three tiles, stock illustrations, emoji as icons, "AI-powered", any number without a unit or a source, any animation that runs while nothing changed, ads, logins, paywalls.

## Build rules

- Mobile first (390 px), then a real wide layout, not a stretched phone.
- Open-source libraries over hand-made parts (Motion, fontsource, three.js, three.quarks, a map library).
- Contrast, tap targets (44 px), keyboard and screen-reader order are tested, not hoped for.
- Reuse the tested calculations in `packages/core`; no component recomputes an AQI.

## Screens, in order

1. **Places**: pins as colour cards (Halo / IQAir).
2. **Today**: gradient hero, hourly, daily, details, the one thing to do.
3. **Map**: Windy-style, time scrubber, monitors and wind.
4. **Fix**: Air Lens (Sunlitt-style), My room and "Did it work?", the World.
5. **Watch**: the heads-up in plain words.
6. **Landing**.

## Open questions

- The map needs a list of monitors in view. Today the API returns only the nearest station for a point, so a new endpoint is needed.
- Air Lens needs the camera and the phone's orientation sensors, which a browser can use only after a permission prompt (iPhone asks every time). Plan a graceful fallback to a still photo.
