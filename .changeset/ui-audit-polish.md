---
"@mj-biz-apps/forms-ng": patch
---

Builder polish from the October UI audit (F12, F14, F22, F23, F24).

- The builder's tab strip is one Tab stop: the arrow keys, Home and End move along it, and each tab names the panel it controls.
- Below 900px the Properties pane opens as a bottom sheet when something is selected, with Done and Escape to close it. The tab strip fades at its edges and scrolls the selected tab into view, and a section's title keeps its own row on a phone.
- Explorer surfaces take spacing from a 4px scale and font sizes from type tokens. New tokens: `--mjf-gap-md`, `--mjf-heading`, `--mjf-figure`, `--mjf-figure-lg`, `--mjf-icon-sm`, `--mjf-icon` and `--mjf-icon-lg`. `--mjf-card-pad-sm` is now 12px.
- Builder dialogs dim the page with `--mj-bg-overlay`, which follows the theme.
- In the respondent widget, `--mjf-focus-ring` is now a colour, as it is in Explorer, and the focus shadow is `--mjf-focus-shadow`. A form style that set the ring to a colour, as the shipped Contrast style does, used to remove the focus indicator.
- The respondent widget no longer takes focus on its first render from a control outside the form that already holds it, such as a host page's own field or the builder's tab strip. After the welcome screen's Start button, the first question still gets focus.
- The rule dialog's confirm button says Save, and the person panel's states name responses instead of forms.
- `lint:ui` gains five rules: undefined MJ tokens, `--mj-color-*` palette steps, the focus ring used as a shadow, raw font sizes, and off-scale spacing.
