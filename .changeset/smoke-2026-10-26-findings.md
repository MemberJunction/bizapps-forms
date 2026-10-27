---
"@mj-biz-apps/forms-core-entities-server": minor
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-ng": minor
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-server": minor
---

Fixes from the 2026-10-26 pre-release smoke test. Ships one migration
(`V202610262300__v0.16.x__Person_Unknown_Surname_Repair`) and new action metadata, so this is a
`minor`.

### For host operators

- **MJAPI now says at boot when `READ_COMMITTED_SNAPSHOT` is off.** It logs an ERROR line: without
  it, two authors who publish, clone or save different forms at the same moment can deadlock, and
  one of them sees the operation fail. Set `FORMS_REQUIRE_READ_COMMITTED_SNAPSHOT=true` to make MJAPI
  stop at boot instead of only logging. Off by default.
- **Respondent People no longer get "(unknown)" as a surname.** When a form has no name question,
  *Upsert Respondent Person* now stores an empty surname. The migration repairs the People rows that
  already carry `LastName = '(unknown)'`; a real surname is never changed.
- **On-submit action logs record result codes.** The four Forms on-submit actions now declare their
  result codes, so `ActionExecutionLog.ResultCode` tells a success from a failure. The declarations
  reach a host with this release's metadata.

### For form authors

- **Publish no longer refuses valid rules at random.** A rule that reads an earlier question was
  sometimes refused as "answered later than this rule runs", depending on the questions' ids. The
  publish check now reads pages, questions and options in display order.
- **Matrix labels are correct.** The response detail and the CSV/Excel export now map a Matrix's
  rows through its row options and its cells through its column options. Before, a row and a column
  with the same value showed the column's label for both. Exported Matrix text changes to the
  correct labels.
- **Archive asks first.** Archiving a form from the Forms home asks for confirmation, because it
  closes every share link of the form.
- **The Forms home refreshes when you return to it**, so response counts are current without a
  page reload.

### For respondents

- **Uploads and drawings now autosave.** A finished file upload or doodle saves the draft at once,
  so a reload or a later visit on the same device keeps it.
- **Offline saving shows its state and retries on reconnect.** When an autosave fails, the footer
  says "Couldn't save yet — will retry" instead of going blank, and the save is sent again as soon
  as the browser is back online, also after a Submit that failed offline.
- **Offline errors are sentences, not browser text.** A submit with no network says "You appear to
  be offline. Your answers are still here — try again when you're connected." instead of "Failed to
  fetch"; a form that cannot load offline says "You appear to be offline. Check your connection and
  try again."
