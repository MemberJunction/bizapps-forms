---
'@mj-biz-apps/forms-ng': patch
---

Responses & Analytics now reads a form's answers once per selection. Every click on a form, and every Refresh, used to read all of that form's answers twice, one read after the other — about 430 KB of extra transfer per click on a form with roughly 500 responses, and a full extra round trip before the report appeared. The answers are now read once, and the form definition and the responses load together instead of one after the other. The exported CSV/Excel sheet is unchanged.

API changes for code that calls these services directly: `ResponsesDataService.loadAnswersForForm` was removed — use `loadResponsesForForm(formId).answers`, or the new `FormReportData.answers`, which carries every answer row the report was built from (partial responses included). `FormsReportingExportService.exportResponses` now takes `(report, format)` and exports `report.answers`.
