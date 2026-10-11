# The Vayu measuring unit

A small box that measures the air in a room and sends it to the app over Bluetooth. It is the one piece of hardware in
the demo. The cleaner prototype is separate (`PURIFIER.md`): its airflow was measured, its CADR was not.

**Status (11 Oct):** the firmware `firmware/vayu-unit/vayu-unit.ino` compiles and runs on an ESP32-S3 (QFN56, with
Wi-Fi and Bluetooth 5 LE) wired to an SPS30 over UART; the serial monitor shows the sensor's serial number and PM1, PM2.5,
PM4 and PM10 every two seconds, and the board advertises as `Vayu-XXXX`. The live site connected to it over Bluetooth from
Chrome on a Mac and showed the readings. **Not yet done:** connecting from an Android phone, and any comparison with a monitor.
Nothing in the app claims a measurement it has not received.

## What it is

| Part               | What                            | Notes                                                                          |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------ |
| Particle sensor    | Sensirion SPS30                 | Laser scattering; PM1.0, PM2.5, PM4.0 and PM10 in µg/m³; UART here; 5 V supply |
| Board              | ESP32-S3 dev board              | Bluetooth LE and Wi-Fi built in; 3.3 V logic; USB-C native serial              |
| Climate (optional) | SHT31                           | Temperature and humidity, I2C, 0x44                                            |
| Power              | 5 V USB                         | A phone charger; about 60 mA                                                   |
| Box                | Any small enclosure with a vent | For outdoors: a radiation shield and a rain guard, which is not built          |

Wiring is in the header of the firmware file: SPS30 pin 2 (RX) to GPIO17, pin 3 (TX) to GPIO18, VDD to 5 V, GND to GND, and `SEL` (pin 4) left unconnected, which selects UART (to ground it would be I2C).

## How it reaches the app

The unit advertises as `Vayu-XXXX` (the last four digits of its address) and offers one service with one notify
characteristic. About every two seconds it sends an 18-byte packet (layout in `apps/web/src/devices/unitProtocol.ts`):
the four particle sizes, temperature and humidity if fitted, and how long it has been on. A packet that is short, from
another version, flagged as having no reading, or physically impossible (PM2.5 above PM10, or above 1,000 µg/m³) is
refused and never shown as air. The first ten seconds after power-on are flagged as warming: shown, never kept.

The app connects with Web Bluetooth, so it works in **Chrome on Android and on a computer**, over HTTPS (the live site
is). It does not work in Safari on an iPhone. The person picks the unit from the browser's own list.

## What the app does with a reading

- Adds the unit from the **Add device** button at the top right of **My Air** (Where is it, then Connect over Bluetooth).
  The unit then becomes the **first card** on My Air, "Your room": the AQI in the level's colour, with the live line of the
  last minutes where a place card has its forecast. The connection stays up as you move between tabs.
- Opens the card to the **room page**: the live line of the room against the air outside (a second, dashed line, so the
  gap is what the room's own air is doing), how much lower or higher the room is, how much of the time it was cleaner
  than outside, the fine share of PM10, a test that marks a purifier switched on or a window opened and says how far
  and how fast the room's PM2.5 moved since, plain advice (air it, keep windows shut), and the room's day by hour from
  the hours it measured. No weather or wind here.
- Sets it against the air outside at the place the unit is in (the nearest monitor's reading, with its name, distance
  and age) and says how much lower or higher the room is.
- Uses it **in place of** the outside reading at the address for the hours spent there. With no address set for that
  place, the unit's room is still the place: only the hours it measured count, and nothing is made up for the rest.
- Keeps the **hourly mean** of each hour (14 days, on the phone), and counts those hours in **Exposure** as "measured
  by your unit", for anyone in that place. An hour needs about two minutes of readings to count; an hour with fewer
  is the labelled assumption, never a made-up number.

## What may be said, and what may not

| Say                                                                                        | Do not say, until it is shown                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "A measuring unit built from a laser particle sensor and an ESP32-S3, read over Bluetooth" | "Scientific-grade", "reference-grade", "highly accurate": low-cost laser sensors are not reference instruments                                                                          |
| "Its reading is shown next to the nearest monitor's, so you can see how they compare"      | "It agrees with the official monitors": that is a result, and needs a few days of the two side by side                                                                                  |
| "A particle sensor of this kind is rated by its maker for continuous running"              | "Rated for ten years in the open": the sensor is not an outdoor-rated product; a weatherproof enclosure, a shield and cleaning are not built or tested                                  |
| "The unit's firmware and wiring are in this repository"                                    | "The unit costs ₹4,000" or "a station costs ₹2,00,00,000", or "5,000 of these for the price of a station": there is no bill of materials or source for either figure in this repository |

Hyperlocal coverage is the point to make: a station cannot be in every street. It is not that the unit replaces a station, which measures more things, to a reference standard, and is maintained.

## A test that makes the claim honest

Put the unit next to the nearest official monitor for a few days and let the app keep both. The app already stores
each hour's measured mean and the nearest monitor's hourly reading; the comparison is a chart and a number (the
mean difference, and the correlation) for the video. If the unit reads high or low by a steady amount, the fix is a
simple offset in the app, shown to the person, never hidden.

## The cleaner

The cleaner prototype is described in `PURIFIER.md`: what was built, the one airflow measurement (about 191 cfm at the outlet), and why that is not CADR. The measuring unit is the instrument for the CADR test that has not been run yet.

## Build steps

1. Wire the SPS30 and the ESP32 as in the firmware header. Power from USB.
2. Install the "Sensirion UART SPS30" library, open `firmware/vayu-unit/vayu-unit.ino`, pick the board "ESP32S3 Dev Module" with USB CDC On Boot enabled, upload. Close the serial monitor first, or the port is busy.
3. Open the serial monitor at 115200. You should see `Advertising as Vayu-XXXX`, then a line of readings every two
   seconds. PM2.5 of 0.0 for a few seconds is normal while the fan settles.
4. On the phone, open the live site in Chrome, press **Add device** at the top right of My Air, choose where the unit is, press **Connect
   over Bluetooth**, and pick `Vayu-XXXX`.
