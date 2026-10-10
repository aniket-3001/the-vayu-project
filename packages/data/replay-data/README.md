# Replay data

Prepared real past weeks for `/v1/replay`. Uploaded under `replay/` in the data bucket.

| Week | Window (UTC)                                             | Stations used                                                                                                       | Events   |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| W1   | 8 Dec 2025 to 15 Dec 2025, with 7 days of history before | NSIT Dwarka (CPCB) for Home, R K Puram (DPCC) for School, Mandir Marg (DPCC) for Office, Lodhi Road (IITM) for Park | none yet |

**Source.** The public OpenAQ archive (`s3://openaq-data-archive`), read over HTTPS with no account. The data belongs to the monitoring agencies behind each station (CPCB, DPCC, IITM) and is redistributed by OpenAQ. Check each provider's licence and credit OpenAQ before the data is shown publicly.

**What was done to it.** Hourly means in UTC; a time is read as the end of its hour; readings above 1,000 µg/m³ (PM2.5) or 2,000 (PM10) are dropped as instrument faults (one Dwarka hour read 10,000). Nothing else was changed.

**Events are empty on purpose.** A GRAP order date goes in only with a source we can cite (`--events events.json` with `{date, label, source}`). Until then the week makes no claim about which GRAP stage applied.

## Regenerate

```bash
npx tsx blocks/02-data-cloud/data/src/replayPrep.cli.ts \
  --week W1 --title "A Delhi week in December 2025" \
  --start 2025-12-08T00:00:00Z --end 2025-12-15T00:00:00Z \
  --stations 17,5622,6931,10484,6358,5613,5634,11607,5586,6957 \
  --out blocks/02-data-cloud/data/replay-data
```

## Upload (Aniket, after the API with `/v1/replay` is deployed)

```bash
AWS_PROFILE=vayu aws s3 cp --recursive blocks/02-data-cloud/data/replay-data/replay s3://<DataBucket>/replay/
```

Then `GET /v1/replay/weeks`, and `GET /v1/replay?week=W1&place=home&asOf=2025-12-12T06:00:00Z`.
