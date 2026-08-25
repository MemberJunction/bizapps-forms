---
"@mj-biz-apps/forms-server": patch
---

Attach a respondent's uploads to the records people actually open.

MJ 6.1.0-edge added a generic record-attachments panel that every generated form already
mounts, and it reads one table: `__mj.FileEntityRecordLink`, filtered by EntityID and
RecordID. Forms recorded a file in two other places — `FormResponseAnswer.FileID` and the
`FormUpload` ledger — and wrote no link rows at all, so a résumé was stored, downloadable
through `GET /forms/files/:id`, and invisible on both the form response and the applicant a
binding created from it.

One reconciler (`packages/Server/src/file-links/`) now makes a record's attachments match a
response's file answers, called from `persistSubmission` for the response row and from the
binding dispatch for the record a binding wrote. Because the binding executor is generic
over target entities, ATS and every future target are covered with no per-app code.

The link table has no unique constraint on (FileID, EntityID, RecordID) and no owner column,
so both guarantees are the writer's: idempotency is a read (autosave, promotion and the
recovery sweep all re-run these paths), and a link is removable only when its file has a
`FormUpload` row for that response — which is what lets a replaced upload disappear while a
file the response never uploaded stays put, whoever attached it. Attaching is gated on the same provenance verdict
that gates writing a file id into a column, now computed once per binding and used for both.
Both writes are best-effort and logged: the response and the bound record are already saved
when they run.

`V202608251800` grants `Forms Automation Runner` Read + Create + Delete on
`MJ: File Entity Record Links`. Deliberately nothing on `MJ: Files`: the attachments panel's
"Delete Completely" — which hard-deletes the file row and orphans its stored bytes
(MemberJunction/MJ#4046) — needs CanDelete on both, and the migration asserts the second is
absent. The submit path's system user already held what it needs.

Verified live with a real upload, both legs, by `npm run smoke:file-links`.
