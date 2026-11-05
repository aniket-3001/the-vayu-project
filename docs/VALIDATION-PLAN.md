# Validation plan: the measuring unit and the advice

Today the unit's accuracy is **not measured** (`UNIT.md`, `AS-BUILT.md`). Until the steps below are done and the results are
written in `claims.md`, nothing may be said about the unit's accuracy, and the purifier's airflow may not be called CADR.
This plan is for a person with the hardware; it cannot be done from code.

## 1. Unit against a reference monitor

**Question:** how close are the SPS30 readings (through the ESP32-S3) to a trusted PM2.5 monitor?

1. Place the unit within 2 m of a reference: a CPCB/DPCC regulatory monitor is ideal; a co-located calibrated monitor (for
   example a Met One BAM or a well-maintained Purple Air with a published correction) is acceptable. Same height, same air.
2. Record at least **14 days**, including a clean spell and a smoggy one (PM2.5 under 30 and over 150 µg/m³).
3. Compare **hourly means** (the app's unit of account). Use only hours where both have at least 45 valid minutes.
4. Report: number of hours, mean bias, mean absolute error, R², and the same split by humidity band (under 60%, 60 to 80%, over 80%),
   because laser sensors over-read in damp air. The verdict code already refuses to judge above 80% humidity
   (`packages/contracts/rules/verdict.json`); the data tells whether that limit is right.
5. Decide a correction (a linear fit, or a humidity-corrected one) only if it holds on a second, separate week.

**Pass bar to write down before looking:** for example mean absolute error under 15% of the reference above 50 µg/m³, and no
bias above 20%. If it fails, the unit is labelled "indicative" everywhere and the verdict thresholds are widened.

## 2. The "did it work?" and room verdict rules

The thresholds (`workingWellPct 50`, `redBelowPct 30`, `minDropPct 20`) are hypotheses held as data. Test them with a real
purifier run: log the room for an hour before and after, with the door and windows in a fixed state, three times. Check the verdict
matches what the numbers show, and that it says "not sure" when the outside air is too clean to judge.

## 3. The purifier (CADR)

The measured 191 cfm is outlet airflow, not CADR. A smoke-decay test (ANSI/AHAM AC-1 style, or a documented simpler
decay in a known room volume) gives CADR: burn a fixed amount of incense in a sealed room, record PM2.5 decay with and without the
purifier, and compute `CADR = V × (k_on − k_off)` where `k` is the decay rate. Publish the room volume, the method, and the
scatter over at least three runs. `packages/core/src/cadr.ts` holds the arithmetic.

## 4. The GRAP estimate

It is checked only against the monitors' own PM10 index (24 station-days). The ground truth is the CAQM order. For each day in a
winter, record the official stage and the app's stage at the nearest monitor, and publish the confusion table. Keep the
"our estimate" wording whatever the result.

## 5. The advice thresholds

The stay-out lengths and mask advice are our words from the US AQI bands. Have a clinician review them (an occupational or
respiratory physician), and cite what they rest on, or soften the wording to match.

## Where results go

Add each result to `docs/claims.md` with the date, the method and the data file, then remove the matching "not measured" line in
`README.md` and `AS-BUILT.md`. If a result is bad, keep the line and add the number.
