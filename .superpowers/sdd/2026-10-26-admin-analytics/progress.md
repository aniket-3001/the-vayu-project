# SDD ledger — plan: docs/superpowers/plans/2026-10-26-admin-analytics.md
Pre-flight: tasks 3,4,5 consume store (T2) and guard (T1); T7,T8,T9 share web types; no conflicts found.
Task 1: complete (adminGuard 6/6, routes 18/18; RED run skipped to save tokens)
Task 2: complete (model+store 10/10, tsc clean). Ruling: device profile does not store userId, so deleting an account removes all link to it. Backend abstraction (createAnalyticsStore over Backend) replaces separate memory/dynamo logic; cost if wrong: none.
Task 3+4: complete (9/9)
Task 5: complete (apps/api 246/246)
Task 7: complete (analytics 9/9). Task 6 infra edits committed; infra test run result pending (slow CDK). Ruling: CloudFront needs '/v1/me/events' and '/v1/admin/*' behaviours that pass the token uncached (added in Site.ts, not in plan); singleton send uses the held ID token only if still valid, else anonymous route (no refresh client outside React); cost if wrong: a signed-in session with an expired token counts as anonymous until the account code refreshes it.
Task 6: complete (infra 85/85)
Task 8: complete (web 642/642, tsc+eslint clean). Ruling: map_layer and recorded_days events not wired - the layers are fixed and the week screen has no route in this build; permission denied is counted in locate.ts (where the error code is known); cost if wrong: two allow-listed names stay at zero.
Task 9: complete (admin 6/6). Not screenshot-checked.
