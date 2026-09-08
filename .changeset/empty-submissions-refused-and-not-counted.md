---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-ng": minor
---

Refuse a public submission that names no question or would store nothing (#124)

A submission whose answers matched no question in the published form came back `success: true`,
wrote a `FormResponse` with `Status = 'Complete'` and zero answers, and incremented the
distribution's `ResponseCount` — so two empty submissions filled a `MaxResponses = 2` link and the
door then turned real respondents away with HTTP 410.

Both rules now land in `validateSubmission`, ahead of every write:

- An answer whose question id is in no page of the published definition is a field error naming
  that id, in every mode. A mixed set is refused whole; a repeated unknown id is reported once.
- A `complete` submission that would store nothing, **on a form that asked something**, is refused
  with a form-level message. A form that asks nothing — an acknowledgement form of pure `Statement`
  copy, or one whose every answerable question is hidden on this path — stays completable.

Behaviour change to note: a respondent who answers nothing on a form of only optional questions now
sees a banner instead of the thank-you screen. The widget refuses that submit locally, so they are
told without a round trip, and both sides now read one shared `NOTHING_TO_SUBMIT_MESSAGE` from
`@mj-biz-apps/forms-entities`.
