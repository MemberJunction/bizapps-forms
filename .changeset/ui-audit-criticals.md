---
"@mj-biz-apps/forms-ng": patch
---

Accessibility and resilience fixes from the October UI audit:

- **Responses & Analytics and the Forms home no longer go blank when one read fails.** A failed report shows "Couldn’t load this form’s responses." with Retry in place, and the rail stays usable. A failed form list says "Couldn’t load your forms." with Retry, instead of "No forms yet". When every form is archived, the page says so and offers "Show archived".
- **Rows and cards are no longer buttons that contain buttons.** This covers Forms home rows, template cards, and builder question and screen cards. The name is the keyboard path, and a click anywhere else on the row still opens it. Move and Delete buttons now name the question they act on.
- **Contrast and size in dark mode.** Primary buttons, template card text, the question number and the drag handle now pass WCAG AA. The drag handle is 24 × 40 px.
- **One-question forms:** Enter on Back, a choice or Retry now does that control's job. It used to go forward, and on the last question it submitted.
- **Matrix, address and required questions are announced correctly.** Each matrix row is its own radio group with arrow keys. Address and contact fields sit under their question. Required choice groups say so.
