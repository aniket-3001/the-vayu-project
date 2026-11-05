# Privacy policy (draft)

> **Draft for review.** This states what the app does today, taken from the code and `README.md`. It has not been reviewed by a
> lawyer. Before it is published at a public address and linked from the App Store and Google Play, a person responsible for
> the project must read it, fill in the contact details, and have it checked against the Digital Personal Data Protection Act,
> 2023 (India) and, if the app is offered outside India, the GDPR.

**Who is responsible:** The Vayu Project, run by [name and postal address to be filled in]. Contact: [email to be filled in].
**Last updated:** [date of publication]

## What the app is

The Vayu Project shows the air quality at places you choose and says what to do about it. It is not a medical service.

## What we collect, and why

| What                                                                                                                                                                                                 | When                                                                                                                   | Why                                                                                                        | Where it is kept                                                                                                                                  | How long                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Email address and password                                                                                                                                                                           | Only if you create an account                                                                                          | To sign you in. The password is kept by Amazon Cognito; we never see it.                                   | Amazon Cognito (AWS, Mumbai)                                                                                                                      | Until you delete the account                             |
| Your places, family members' names and ages, outdoor time, settings                                                                                                                                  | If you use the app signed in, a copy is saved to your account. Signed out or as a guest, they stay on your phone only. | So they follow you to another device                                                                       | DynamoDB (AWS, Mumbai), under your account                                                                                                        | Until you delete the account, or sign out on that device |
| The coordinates of a place you look up                                                                                                                                                               | Every time the air for a place is fetched                                                                              | To find the nearest monitor. Rounded to two decimals (about a kilometre).                                  | Not stored with your identity; the answer is cached for a few minutes                                                                             | Minutes                                                  |
| Your device's location                                                                                                                                                                               | Only when you press **Detect my location** or turn on live location                                                    | To show the air where you are                                                                              | On your phone                                                                                                                                     | Until you turn it off                                    |
| The words you type to search for a place                                                                                                                                                             | When you search                                                                                                        | To find the place. Sent to Open-Meteo and Photon.                                                          | Not kept by us                                                                                                                                    | None                                                     |
| Questions to the assistant and its spoken answers                                                                                                                                                    | When you use the assistant                                                                                             | To answer. Your family's names and the place name are replaced before the text goes to the language model. | Counted per day for limits; the text is not kept as part of your profile                                                                          | Daily counts expire                                      |
| Microphone audio                                                                                                                                                                                     | When you tap the microphone                                                                                            | To turn speech into words, using your phone's own recogniser                                               | Not recorded or sent by us                                                                                                                        | None                                                     |
| Camera view                                                                                                                                                                                          | When you open AIR Lens                                                                                                 | To draw the air in front of what you see                                                                   | Never recorded or sent                                                                                                                            | None                                                     |
| Bluetooth                                                                                                                                                                                            | When you connect a measuring unit                                                                                      | To read your room's air                                                                                    | On your phone                                                                                                                                     | Hourly means stay on the phone                           |
| Usage statistics: screens opened, features used, permission results, errors, time in the app, device kind, app version, city (from a place rounded to about 11 km), the AQI band you were looking at | While you use the app                                                                                                  | To see what works and what breaks                                                                          | DynamoDB. Signed-in people are counted by account; everyone else under a random id the app makes. Nothing you type and no place name is included. | Raw account events 90 days; daily totals about a year    |
| Requests and fire reports you send                                                                                                                                                                   | When you send one                                                                                                      | To pass on what you asked                                                                                  | DynamoDB                                                                                                                                          | 180 days                                                 |
| A daily-changing hash of your internet address                                                                                                                                                       | On every request                                                                                                       | To apply the daily limits. The address itself is not stored.                                               | DynamoDB                                                                                                                                          | One day                                                  |

We do not sell your data, share it for advertising, or use it to build advertising profiles.

## Who else receives data

Amazon Web Services (hosting, sign-in, database, the language model, speech); OpenAQ, Open-Meteo, MET Norway, NASA FIRMS and
Photon (air, weather, wind, fire and place data, which receive coordinates or search words but not your identity); OpenFreeMap
(map tiles, which sees your address as any website does).

If crash reporting is switched on for a release, Sentry (a service that collects error reports) also receives the kind of error, its message and its technical trace, and the app version. We remove your identity, your address, the page you were on and any coordinates before it is sent. [If enabled: confirm this paragraph, name the Sentry data region, and state the retention period.]

## Your choices

- **Delete your account** on the Account page. This deletes your saved copy, your usage timeline and the account itself.
- **Use the app as a guest** (phone apps) or without an account: nothing is sent to an account.
- **Turn off location** at any time in the app or in your phone's settings.
- **Ask us** to see or correct what we hold about you, by writing to the address above.

## Children

The app lets an adult add the names and ages of children in their family. It does not knowingly create accounts for people under 18. [To be reviewed: the DPDP Act requires verifiable consent of a parent or guardian for processing a child's data.]

## Security

Connections use HTTPS. Data is held in AWS with access limited to the app's own services. See `SECURITY.md` to report a problem.

## Changes

If this changes in a way that matters, the app will say so before the change takes effect.
