# The Vayu measuring unit

A small box that measures the air in a room and sends it to the app over Bluetooth. It is the one piece of hardware in
the demo. The purifier build is separate and is shown only as a build with a measured CADR.

Everything here is a plan and a code skeleton until the unit has been built and run. `firmware/vayu-unit/vayu-unit.ino`
has not been compiled or run on a board yet, and nothing in the app claims a measurement it has not received.

## What it is

| Part               | What                            | Notes                                                                            |
| ------------------ | ------------------------------- | -------------------------------------------------------------------------------- |
| Particle sensor    | Sensirion SPS30                 | Laser scattering; PM1.0, PM2.5, PM4.0 and PM10 in µg/m³; I2C or UART; 5 V supply |
| Board              | ESP32 DevKit                    | Bluetooth Low Energy built in; 3.3 V logic                                       |
| Climate (optional) | SHT31                           | Temperature and humidity, I2C, 0x44                                              |
| Power              | 5 V USB                         | A phone charger; about 60 mA                                                     |
| Box                | Any small enclosure with a vent | For outdoors: a radiation shield and a rain guard, which is not built            |

Wiring is in the header of the firmware file. `SEL` on the SPS30 must go to ground, or it speaks UART instead of I2C.

## How it reaches the app

The unit advertises as `Vayu-XXXX` (the last four digits of its address) and offers one service with one notify
characteristic. About every two seconds it sends an 18-byte packet (layout in `apps/web/src/devices/unitProtocol.ts`):
the four particle sizes, temperature and humidity if fitted, and how long it has been on. A packet that is short, from
another version, flagged as having no reading, or physically impossible (PM2.5 above PM10, or above 1,000 µg/m³) is
refused and never shown as air. The first ten seconds after power-on are flagged as warming: shown, never kept.

The app connects with Web Bluetooth, so it works in **Chrome on Android and on a computer**, over HTTPS (the live site
is). It does not work in Safari on an iPhone. The person picks the unit from the browser's own list.

## What the app does with a reading

- Shows it live on the **Devices** tab: PM2.5 and its AQI, PM1 and PM10, room temperature and humidity.
- Sets it against the air outside at the place the unit is in (the nearest monitor's reading, with its name, distance
  and age) and says how much lower or higher the room is.
- Keeps the **hourly mean** of each hour (14 days, on the phone), and counts those hours in **Exposure** as "measured
  by your unit", for anyone in that place. An hour needs about two minutes of readings to count; an hour with fewer
  is the labelled assumption, never a made-up number.

## What may be said, and what may not

| Say                                                                                                                        | Do not say, until it is shown                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "A measuring unit built from a laser particle sensor and an ESP32 that costs about ₹4,000" (confirm the bill of materials) | "Scientific-grade", "reference-grade", "highly accurate": low-cost laser sensors are not reference instruments                                         |
| "The sensor's datasheet gives a lifetime of more than ten years of continuous running" (check the figure in the datasheet) | "Rated for ten years in the open": the sensor is not an outdoor-rated product; a weatherproof enclosure, a shield and cleaning are not built or tested |
| "Its reading is shown next to the nearest official-network monitor's, so you can see how they compare"                     | "It agrees with the official monitors": that is a result, and needs a few days of the two side by side                                                 |
| "For the price of one monitoring station (your figure: ₹2,00,00,000) you could put up about 5,000 of these"                | "These do the same job as a station": a station measures more things, to a reference standard, and is maintained                                       |

The arithmetic: ₹2,00,00,000 ÷ ₹4,000 = 5,000 units. Be clear it is the cost of the _boxes_; running 5,000 of them also
needs power, connectivity, calibration against a reference and replacement, which is why the claim to make is
**"hyperlocal coverage that a station cannot give"** and not "a station replaced".

## A test that makes the claim honest

Put the unit next to the nearest official monitor for a few days and let the app keep both. The app already stores
each hour's measured mean and the nearest monitor's hourly reading; the comparison is a chart and a number (the
mean difference, and the correlation) for the video. If the unit reads high or low by a steady amount, the fix is a
simple offset in the app, shown to the person, never hidden.

## The purifier, in one slide

The build is the one in `DEVICE.md`'s earlier design or a simpler fan-and-filter box. What to show:
the build cost (your figure, under ₹5,000), the **CADR you measured** with the smoke-decay method and the anemometer
(`DEVICE.md` section 5 has the method), and the noise at the speed you measured it. Say "built from a video tutorial"
if that is what it is; the point is the measurement.

## Build steps

1. Wire the SPS30 and the ESP32 as in the firmware header. Power from USB.
2. Install the libraries listed there, open `firmware/vayu-unit/vayu-unit.ino`, pick the board "ESP32 Dev Module", upload.
3. Open the serial monitor at 115200. You should see `Advertising as Vayu-XXXX`, then a line of readings every two
   seconds. PM2.5 of 0.0 for a few seconds is normal while the fan settles.
4. On the phone, open the live site in Chrome, go to **My Air → Devices**, choose where the unit is, press **Connect
   over Bluetooth**, and pick `Vayu-XXXX`.
