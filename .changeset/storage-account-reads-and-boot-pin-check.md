---
"@mj-biz-apps/forms-server": patch
---

Asset images and respondent-file downloads now read through the account that holds the file (#290). `MJ: Files` records a provider but not an account, and reads used to go through whichever account the engine listed first. Now they probe every account on the file's provider, so two or more accounts on one provider no longer break reads, and a host can read back what it uploaded. The order is: the account that last served that file (once this process has read it), then the pins (`FORMS_ASSET_STORAGE_ACCOUNT` for assets; `FORMS_UPLOAD_STORAGE_ACCOUNT` then `FORMS_DOWNLOAD_STORAGE_ACCOUNT` for downloads), then the provider's other accounts. A file served by a later account logs one warning per file, not one per request. A read that fails on every account logs the account(s) tried, the provider, the storage key and each cause. The response a respondent sees is unchanged.

If the File Storage metadata failed to load, a read now retries the load once. If it still has not loaded, the log says so; it no longer reports "No storage account resolves".

The public asset route now refuses storage keys that contain a `.` or `..` path segment or a backslash.

**New at startup.** Forms logs a warning when several active accounts exist and `FORMS_ASSET_STORAGE_ACCOUNT` / `FORMS_UPLOAD_STORAGE_ACCOUNT` are unset. In that case uploads go to whichever account the engine resolves first, which can differ between hosts sharing a database, so every such host should pin the same account. Forms logs `[Forms] Storage is NOT ready` when a pin names no account, and a separate error when a pin names an account whose provider is inactive. Forms still uses that account, but MJ treats its provider as switched off.

This does not fix the reported case of a single Box account failing. It makes that case diagnosable: the failure log line now names the account, the provider and the driver's error (for example a refused token refresh).
