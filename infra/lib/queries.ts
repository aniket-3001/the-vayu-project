/** The saved Athena queries. Plain strings, so a test can check each one before anything is deployed. */

export const DATABASE = 'vayu';

/** The demo-place stations whose December 2025 data week W1 is built from (see data/replay-data). */
export const W1_LOCATION_IDS = [17, 5622, 6931, 10484, 6358, 5613, 5634, 11607, 5586, 6957];

/**
 * Does the public OpenAQ archive hold December 2025 PM2.5 for the stations week W1 uses?
 * Filters on the partition columns, so it reads a handful of small files and not the archive.
 */
export const ARCHIVE_CHECK_SQL = `SELECT location, count(*) AS readings, min(datetime) AS first_reading, max(datetime) AS last_reading
FROM ${DATABASE}.openaq_archive
WHERE locationid IN (${W1_LOCATION_IDS.join(', ')})
  AND year = 2025 AND month = 12
  AND parameter = 'pm25'
GROUP BY location
ORDER BY location`;

/**
 * How wrong the regional forecast is, by how far ahead it looked. Every harvest stored what the
 * forecast predicted; later harvests stored what the station then measured. Both use IST hour
 * starts, so they join on the parsed time. Bias above zero means the forecast ran high.
 * Bounded by the `dt` partition, so it only reads the days named.
 */
export const FORECAST_ERROR_SQL = `WITH predicted AS (
  SELECT placeid, from_iso8601_timestamp(harvestedat) AS made_at,
         from_iso8601_timestamp(h.hourstart) AS hour_start, h.pm25 AS predicted_pm25
  FROM ${DATABASE}.harvest_forecast CROSS JOIN UNNEST(hours) AS t(h)
  WHERE dt >= '2026-10-08' AND status = 'ok' AND h.pm25 IS NOT NULL
),
observed AS (
  SELECT placeid, from_iso8601_timestamp(h.hourstart) AS hour_start, max_by(h.pm25, harvestedat) AS observed_pm25
  FROM ${DATABASE}.harvest_station CROSS JOIN UNNEST(hours) AS t(h)
  WHERE dt >= '2026-10-08' AND h.pm25 IS NOT NULL
  GROUP BY placeid, from_iso8601_timestamp(h.hourstart)
)
SELECT date_diff('hour', p.made_at, p.hour_start) AS hours_ahead,
       count(*) AS hours_compared,
       round(avg(abs(p.predicted_pm25 - o.observed_pm25)), 1) AS mean_abs_error,
       round(avg(p.predicted_pm25 - o.observed_pm25), 1) AS bias
FROM predicted p JOIN observed o ON p.placeid = o.placeid AND p.hour_start = o.hour_start
WHERE p.hour_start > p.made_at
GROUP BY 1
ORDER BY 1`;

/** How many days of harvest exist, and how many places answered with a fresh station each day. */
export const HARVEST_COVERAGE_SQL = `SELECT dt, count(*) AS place_lines,
       count_if(status = 'fresh') AS fresh,
       count_if(status = 'no_fresh_station') AS no_fresh_station
FROM ${DATABASE}.harvest_station
WHERE dt >= '2026-10-08'
GROUP BY dt
ORDER BY dt`;

/**
 * What the units have sent, per unit per day: how many readings, the middle PM2.5, and how many
 * were simulated (the dev publisher). History comes from Firehose, so it is minutes behind.
 */
export const DEVICE_HISTORY_SQL = `SELECT dt, thingid, count(*) AS readings,
       approx_percentile(pm25, 0.5) AS median_pm25,
       count_if(simulated) AS simulated_readings
FROM ${DATABASE}.device_readings
WHERE dt >= '2026-10-08'
GROUP BY dt, thingid
ORDER BY dt, thingid`;
