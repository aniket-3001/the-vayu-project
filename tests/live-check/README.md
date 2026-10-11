# Live checks by driving a browser

These scripts drive headless Chrome against the deployed site and print PASS or FAIL for each thing a person would check by hand: the screens at a phone's width (390 px) and a laptop's (1280 px), the switches, Detect my location, the fire report, the assistant in English and Hindi, and the app with the network off. `docs/LIVE-CHECKLIST.md` says what they found and what they cannot check.

```bash
# Chrome must be installed. Node 22 or later.
node tests/live-check/screens.mjs 390 844      # phone
node tests/live-check/screens.mjs 1280 800     # laptop
node tests/live-check/fire-report.mjs          # a recorded day's fire: popup, then the report sheet
node tests/live-check/assistant.mjs            # logging a walk, then Hindi
node tests/live-check/offline.mjs              # readings stay when the network goes
CHROME_ARGS="--autoplay-policy=no-user-gesture-required" node tests/live-check/screens.mjs 390 844   # lets the voice play in headless Chrome
LIVE_URL=https://... node tests/live-check/screens.mjs 390 844   # another address
```

Screenshots go to `tests/live-check/out/` (not kept in git). The scripts do not submit the request form and do not sign in anywhere. They use the assistant, so they use a little of its daily allowance.

They are checks I run by hand, not part of `make prove`: they need a browser and the live site.
