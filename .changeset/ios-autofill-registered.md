---
'@mj-biz-apps/forms-ng': patch
---

Autofilled text is now registered by the respondent widget (#268). iOS Safari's contact AutoFill
fills fields that are not focused with a `change` event only, which the widget ignored, so First /
Last name showed the respondent's details while Next and Submit reported them as required. Text,
number and address/contact inputs now also listen for `change`, Next and Submit re-read every visible
text field before validating, and a ShortText whose prompt is "First name", "Last name", "Full name",
"Company" (and close variants) now carries the matching `autocomplete` token so AutoFill targets it
predictably.
