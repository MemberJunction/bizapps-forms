---
"@mj-biz-apps/forms-entities": patch
---

The release cuts and opens its own pull requests again. `#177` removed every push to a protected
branch — correctly, because a required status check can never be satisfied by a SHA the remote has
not seen — and replaced the automation with a runbook that was never once executed; nothing has
shipped since `v0.10.0`. A new *Prepare a release* dispatch now cuts `release/vX.Y.Z`, bumps, and
opens the PR into `main`, and `publish.yml` opens the `main` → `next` back-merge PR it used to ask a
human to open. Both are written by a GitHub App, which is required only because GitHub does not start
workflow runs from `GITHUB_TOKEN`-authored events; it writes solely to branches no ruleset covers, so
both rulesets keep `bypass_actors: []` and `lint:release-pushes` stays green. Adds
`npm run release:plan`, a read-only readiness report, and `verify-release-app-token`, a read-only
credential probe. Ships no migration and no metadata, so patch.
