# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

- Use GitHub's **Report a vulnerability** button on the repository's Security tab (private advisory), or
- email **aniket22073@iiitd.ac.in** with "Vayu security" in the subject.

Include what you found, how to reproduce it, and what it could let someone do. You will get a reply within 5 working days. Please
give us a reasonable time to fix it before telling anyone else, and do not read or change other people's data.

## What is in scope

The live app and its API (`https://d3lmq1mze2gup3.cloudfront.net`), the phone apps built from `apps/mobile`, and the code in this
repository. Out of scope: denial-of-service or load testing, social engineering, and problems in the third-party services we
use (OpenAQ, Open-Meteo, NASA FIRMS, AWS) that are not caused by how we use them.

## What we already do

See [`docs/safety.md`](docs/safety.md) for the rules and [`docs/AS-BUILT.md`](docs/AS-BUILT.md) for the known limits, including
the ones listed there as not yet fixed.
