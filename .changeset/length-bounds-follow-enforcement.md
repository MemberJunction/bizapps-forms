---
"@mj-biz-apps/forms-ng": patch
---

**The length bounds are now offered wherever they are enforced (#80 follow-up).** The validation
editor showed `Min length` / `Max length` only on `ShortText` and `LongText`, but both validators
apply `minLength`/`maxLength` to any answer that is a string — which `QUESTION_TYPE_BEHAVIOR` says
is every `answerColumn: 'text'` type, `Email`, `Phone` and `Website` included. An Email question
carrying `{"minLength":10,"maxLength":5}` therefore rejected every address a respondent could
type — `a@b.co` was told to use at least 10 characters, `long@example.com` to use at most 5 — while
the editor showed no boxes for the pair and the new conflict check never looked at it, because it
asks only about pairs on screen.

Worse, the editor **re-emitted** that invisible pair: every edit ships the whole rule, so an author
adjusting the pattern on such a question silently re-persisted the contradiction they could not
see. That is the same "a pattern edit carries the impossible pair out with it" failure the whole-rule
refusal was written to prevent, on the types the refusal did not cover.

`showLength` is now derived from the behaviour table rather than hardcoded: `answerable` and
`answerColumn === 'text'` and `optionMode === 'none'`. Shown and enforced coincide, so the conflict
check reaches every pair that can actually trap a respondent, and the author always has the two
boxes the refusal asks them to reconcile — reporting a conflict in a pair with no controls would be
a lockout whose only escape is deleting the whole rule.

Numeric types keep no length boxes: their answers are not strings, so the pair genuinely never
fires there. Choice types (`SingleChoice`, `Dropdown`, `PictureChoice`) are excluded too — they
store text, but the answer is an option the author wrote, so a length bound on it is not a rule
anybody authors.
