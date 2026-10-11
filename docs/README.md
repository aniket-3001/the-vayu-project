# The documents

There are many documents, and the same facts could drift if they were kept in several places. So each kind of fact has one home, and the others link to it.

| If you want…                                                                | Read                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| What is live, what is switched off, what is not built, and the known limits | [`AS-BUILT.md`](AS-BUILT.md) (the one place for status)                                          |
| What was checked on the live address, and what was not                      | [`LIVE-CHECKLIST.md`](LIVE-CHECKLIST.md) (scripts in `tests/live-check/`)                        |
| Every rule the app must keep, how it is enforced, the test                  | [`safety.md`](safety.md)                                                                         |
| Every public claim and what supports it                                     | [`claims.md`](claims.md)                                                                         |
| What it costs and what each cap allows                                      | [`cost.md`](cost.md)                                                                             |
| How the parts fit, and the AWS pillars                                      | [`architecture.md`](architecture.md), [`architecture-animated.html`](architecture-animated.html) |
| What the assistant may and may not do                                       | [`AGENT-BOUNDARIES.md`](AGENT-BOUNDARIES.md)                                                     |
| The measuring unit and the cleaner prototype                                | [`UNIT.md`](UNIT.md), [`PURIFIER.md`](PURIFIER.md), [`COMPARISON.md`](COMPARISON.md)             |
| What broke and how it was fixed                                             | [`learning-log.md`](learning-log.md)                                                             |
| The write-up and the video plan                                             | [`blog.md`](blog.md), [`VIDEO.md`](VIDEO.md)                                                     |
| The words for the submission form                                           | [`../submission/`](../submission/)                                                               |
| The plan the app was first built to (historical)                            | [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md)                                               |

If a status fact appears in two places and they disagree, `AS-BUILT.md` is right and the other is a bug.
