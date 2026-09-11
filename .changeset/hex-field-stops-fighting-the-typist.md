---
"@mj-biz-apps/forms-ng": patch
---

A six-digit hex code can be typed into the Design tab's colour picker again.

One function both sanitised each keystroke and expanded shorthand, and a three-character string is
both a prefix and a shorthand. So `#1a2b3c` was rewritten to `#11aa22` at the third character,
emitted as the author's colour, and the remaining keystrokes were dropped by the six-digit cap —
pasting worked only because it never passed through a three-character state.

`sanitizeHexInput` now runs per keystroke and never expands; `normalizeHexInput` keeps its
behaviour and runs on blur and Enter, so `#abc` still becomes `#aabbcc` at commit. Clearing the
field also leaves it empty instead of putting the `#` back.
