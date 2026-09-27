---
'@mj-biz-apps/forms-actions': patch
'@mj-biz-apps/forms-server': patch
---

On-submit hooks and configured automations now run on a provider instance of their own instead of the process-global one. On a host where creating the respondent's Person fires bizapps-common's `Common.LogActivity` entity action, that action's transaction on the global provider captured the later hooks' queries, so `Forms: Create Followup Task` and `Forms: Analyze Written Responses` failed on every submit with "Requests can only be made in the LoggedIn state, not the SentClientRequest state" (#260). Forms actions also honour `RunActionParams.Provider` when a caller supplies one. Async configured automations each get their own isolated provider, and so does the detached revoke of a sealed response's resume links.
