---
"@mj-biz-apps/forms-server": patch
---

Serve the widget bundle from install paths containing a dot segment (#24)

`WidgetBundleMiddleware` called `res.sendFile(filePath, cb)` without a `dotfiles` option.
Express's `send` defaults it to `'ignore'` and its `containsDotFile` check walks **every**
segment of the absolute path — not just the basename — whenever no `root` is given. Any
install under a dot directory therefore 404'd inside `send` and surfaced as a 500 for a file
that was plainly there. Verified against a live MJAPI: the same bundle bytes served 200 from
`/opt/app/...` and 500 from `.worktrees/app/...`, and `dotfiles: 'allow'` restored 200.

The paths that hit it are ordinary, not exotic — a git worktree under `.worktrees/` or
`.claude/`, a release layout like `/opt/.releases/current`, anything under `~/.local/share/`,
and several CI runner and PaaS layouts.

It failed silently in the one place an operator would look. Boot still logged
`[Forms] Widget bundle served at <path>`, the file existed, and the version was correct — so
the only symptom was a respondent seeing a blank form, indistinguishable from the #20 symptom
that had just been fixed.

The sourcemap route shared the defect through the same helper, so devtools got a 500 on
exactly the asset that makes a minified production fault readable. One fix covers both.

`'allow'` carries no traversal risk here: `filePath` comes from `getWidgetBundleConfig()` —
an operator-set env var, `require.resolve`, or a monorepo constant — and never from the
request, and the route serves exactly two fixed files.

Also adds route-level tests that stand the middleware up on a real express server and assert
over real HTTP. The existing unit tests could not reach this bug class at all: path
*resolution* was always correct, it was path *serving* that failed.
