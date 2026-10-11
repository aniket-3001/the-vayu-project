# Comparison for the video: Dyson HushJet Purifier Compact

What the Dyson figures are, where they come from, and what we can and cannot say next to our prototype. Checked on 11 October 2026.

## The Dyson figures (as published, with their sources)

| Item           | Figure                                                                           | Source                                                                                                                                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model          | Dyson HushJet Purifier Compact (HJ10)                                            | [Dyson, product page](https://www.dyson.com/discover/innovation/new-machines/dyson-hushjet-purifier-compact)                                                                                                                                                                                                                  |
| Price in India | ₹29,900 at launch; Reliance Digital lists ₹29,900 against an MRP of ₹34,900      | [Business Standard, 3 Dec 2025](https://www.business-standard.com/technology/tech-news/dyson-launches-hushjet-purifier-compact-in-india-check-price-and-features-air-pollution-delhi-125120300849_1.html); [Reliance Digital](https://www.reliancedigital.in/product/dyson-hushjet-compact-air-purifier-black-misrwj-9670883) |
| CADR           | 250 m³/h, for a room of about 100 m²                                             | Business Standard (India launch coverage); a UK retailer listing of the HJ10 (Currys) gives the same 250 m³/h                                                                                                                                                                                                                 |
| Noise          | 24 dB(A) in sleep mode                                                           | MySmartPrice launch coverage                                                                                                                                                                                                                                                                                                  |
| Filter         | Electrostatic filter with activated carbon; Dyson says it lasts up to five years | MySmartPrice; Dyson listings                                                                                                                                                                                                                                                                                                  |

**A discrepancy to know about:** Dyson's global specification page was reported (in a search summary, not read directly: the page returned 403 to us) to give 131 ft³/min, about 222 m³/h, and a smaller room size. The 250 m³/h figure comes from the India launch coverage. Re-read Dyson's own page for your region before the video and quote that one.

## Ours

| Item                  | Figure                                                            | Source                               |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| Airflow at the outlet | about 191 cfm, about 325 m³/h                                     | `PURIFIER.md`, the anemometer frames |
| CADR                  | **not measured**                                                  |                                      |
| Cost                  | the author's bill of materials (not yet written down in the repo) |                                      |

## What can honestly be said

- Dyson's number is a **CADR**. Ours is **airflow**. They are different quantities, and CADR is always lower than airflow, so "325 m³/h against 250 m³/h" proves nothing and must not be shown as a win.
- To compare like with like we need our own CADR: run the smoke-decay test with the measuring unit (see `PURIFIER.md`) and report the figure it gives, with its fit.
- **Price** can be compared now, but only with a real total for our build (fan, filter, foam, box, wiring), every line from a receipt or a stated price. Known single prices in the author's notes: the fan ₹3,300 and a foam sheet ₹200; the filter and the rest are not yet totalled. Do not quote a total until it is.
- Say what each is: Dyson is a finished, certified, quiet product with a five-year filter claim. Ours is a prototype with no noise, power or efficiency measurement.
