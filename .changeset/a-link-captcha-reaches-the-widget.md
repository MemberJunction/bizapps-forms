---
"@mj-biz-apps/forms-server": patch
"@mj-biz-apps/forms-ng": patch
---

A share link's captcha requirement now reaches the widget that has to satisfy it, and the Distribute panel can set it.

The submit gate demands a captcha when **either** the form's `settings.captchaRequired` or the share link's `FormDistribution.CaptchaRequired` is on — `captchaRequired(a, b)` is an OR, and `submit-pipeline` stage 4 has always called it with both. `PublishedForm` answered with only the first. So a link with the column on rendered no challenge, collected no token, and had every completed submission refused with `Captcha verification failed (missing-token).` — with Turnstile fully configured, and nothing on screen the respondent could do about it. The flag was enforced at submit and never sent to the thing that had to satisfy it.

`publicFormPayload` now applies that same `captchaRequired` before serializing. To the **definition**, not to `settings` alone: the widget's transport selects `definitionJSON` and parses that into the whole definition, so writing `settingsJSON` only would have satisfied a shape check and changed nothing a respondent sees. Its new parameter is required rather than optional, so a later call site cannot quietly reintroduce the half-answer. No widget change was needed — it already renders the challenge when the definition asks for one, and already shows the config-gap message when a captcha is required but no site key is configured.

The Distribute settings panel gains a captcha switch per share link, beside "Open to responses". Its hint states the cost rather than describing the feature, because Turnstile is fail-closed and the host's environment is invisible from the builder: enabling it needs server-side Turnstile keys, and without them every submission through the link is refused. Until now the column was reachable only from a raw entity form, so an author could not see — let alone undo — a setting that made their form unsubmittable.

Turning the switch off does not turn a captcha off for a form that requires one itself; the server still ORs the two.

`.env.example` now documents `FORMS_TURNSTILE_SITE_KEY` alongside the secret. It listed only the secret, which is the half that verifies a token — not the half that lets the widget draw a challenge to produce one. An operator who set only the secret got a form that showed every respondent the configuration message instead of a submit, and the entry that would have told them why was missing. The surrounding note also called Turnstile per-distribution; it is demanded by the form's own setting OR the link's, which is the OR this change finally honours on both sides.

`patch`: no migration and no metadata. The column default was already corrected to `0` in `V202609011500__v0.12.x__Captcha_Opt_In_By_Default.sql`, which named this gap as the remaining half. Closes #151.
