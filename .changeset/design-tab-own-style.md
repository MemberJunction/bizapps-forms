---
'@mj-biz-apps/forms-ng': patch
---

The Design tab no longer fails to load for a form that shares its name with another form ("Untitled form" is every new form's name), or whose name is close to the 255-character limit: a form's own style is now named with a short unique suffix that fits the column. Restyling a form made from a template (or a template saved from a form) no longer restyles the original too — the Design tab forks a per-form style that another form also uses before writing to it.
