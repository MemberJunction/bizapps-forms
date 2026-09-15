---
'@mj-biz-apps/forms-entities': patch
'@mj-biz-apps/forms-actions': patch
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-ng': patch
'@mj-biz-apps/forms-core-entities-server': patch
---

`Prepare a release` pushes as the App again, not as `github-actions[bot]`

`actions/checkout` defaults to `persist-credentials: true`, which writes an
`http.https://github.com/.extraheader` entry carrying `GITHUB_TOKEN` into the local git config.
That header matches every github.com remote — including the one whose URL carries the App token —
and outranks URL credentials, so the release branch was pushed as `github-actions[bot]`. The job
holds `contents: read` by design, so the push was refused with a 403 that named neither credentials
nor the cause. The checkout no longer persists a credential. `publish.yml` is deliberately left
alone: it pushes the release tag through `origin` and needs the persisted one.
