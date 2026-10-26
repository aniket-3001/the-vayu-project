# Journey analytics: milestones, retention, air context and the sign-in funnel

Builds on `2026-10-26-admin-analytics-design.md`. Same rules: admin-only (enforced by the API), no free text, nothing finer
than a city, no notice in the app (the owners' call).

## Why

The first version counts what people do but cannot say whether the app *works for them*. Three questions it cannot answer:

1. **Do new people come back, and what do the ones who stay do first?** (milestones and retention)
2. **Do people use the app more when the air is bad, or out of habit?** (air context)
3. **Where do visitors drop out between the welcome screen and a signed-in account?** (sign-in funnel)

These are the cheapest of the ideas discussed, need no new infrastructure, and make the later ones (alert fatigue,
experiments) measurable.

## Non-goals

- No profiling of individuals. Everything new is a group or cohort figure; the per-account timeline is unchanged.
- No raw-event storage beyond what exists (90 days for signed-in timelines).
- No experiments, alert-open tracking or advice tracking in this step.
- Not "time in the app" as a success measure. It stays, but nothing new builds on it.

## What is added

### 1. Milestones and retention (a "cohort" per first day)

For every device (signed in or not) the server keeps one small record under the day the device was first seen:

- the first time it reached each **milestone**, taken from events it already sends: `first_place` (add a place),
  `first_search`, `first_detect` (detect my location), `first_lens`, `first_exposure`, `first_map`, `first_assistant`,
  `first_unit` (a Bluetooth unit connected), `first_signed_in`;
- the list of **days it was active** (capped at 120).

From these the panel shows, by **week of first visit**: how many new devices, the share that reached each milestone,
and the share that **came back** the next day, **within 7 days** and **within 30 days**. A figure is only shown once the
window has fully passed, and always with its counts ("5 of 13"), because the numbers are small.

*My call:* "within 7 / 30 days" rather than "on exactly day 7 / 30", because with a small user base the exact-day
figure is mostly noise.

The record holds no account id, so deleting an account leaves nothing that points at the person.
Devices first seen before this shipped are marked `legacy` and left out of these figures (their early days are unknown).

### 2. Air context

Each event carries the **AQI band** of the place the person was last looking at: good, moderate, sensitive,
unhealthy, very bad, hazardous (or nothing, if no air had loaded). A `context` event, once per session per band,
says "this session saw this band". The panel gets a new grouping, **AQI band**:

- *Sessions* = sessions that saw that band;
- every other figure (screens, features, errors, time) = what happened **while** that band was showing.

So "actions per session on hazardous days" against "on good days" reads straight off the table.

### 3. Sign-in funnel

The welcome screen reports: shown (`screen:welcome`), opened sign-in, opened create-account, reached the email-code step,
confirmed, signed in, continued as guest, opened the recorded days (already counted), and any step that failed.
The panel shows them in order with the share of "shown".

## Server and panel

- `POST /v1/events` and `/v1/me/events` accept the new `context` kind, the new `screen`/`feature` details, and an
  optional `band` on any event; an unknown band is dropped, not refused.
- `GET /v1/admin/journey?weeks=8` returns the cohorts; `GET /v1/admin/groups?by=band` is the new grouping.
- A **Journey** tab in the admin panel: *Who comes back*, *What new people do first*, *Sign-in funnel*.
- No infrastructure change: the existing `GET /v1/admin/{proxy+}` route covers the new path.

## Risks and limits (stated, not fixed)

- Cohort updates read, change and write one record per batch. Two batches from one device at the same instant can lose
  one update; for analytics this is accepted.
- Small numbers. Treat percentages with a few devices behind them as anecdotes; the panel prints the counts for that reason.
- Retention counts days the device sent data, so a day with the app open but no network is a missed day.
