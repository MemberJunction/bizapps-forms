---
"@mj-biz-apps/forms-server": patch
---

Asset images and respondent-file downloads no longer fail when a database has more than one File Storage Account (#290). Reads now try the pinned account first (`FORMS_ASSET_STORAGE_ACCOUNT`; `FORMS_UPLOAD_STORAGE_ACCOUNT` then `FORMS_DOWNLOAD_STORAGE_ACCOUNT` for downloads) and then every other account on the file's provider, so a host can read back what it uploaded. A read that still fails logs the account(s) tried, the provider, the storage key and each cause; the respondent-facing response is unchanged.

**New at startup.** Forms logs a warning when several accounts exist and `FORMS_ASSET_STORAGE_ACCOUNT` / `FORMS_UPLOAD_STORAGE_ACCOUNT` are unset (uploads then go to whichever account the engine resolves first, which can differ between hosts sharing a database; pin the same account on every host), and logs `[Forms] Storage is NOT ready` when a pin names no active account.
