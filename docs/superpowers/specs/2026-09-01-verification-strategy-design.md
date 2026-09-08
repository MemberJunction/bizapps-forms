# Verification strategy for the credential lifecycle — design

**Date:** 2026-09-01 · **PR:** #109 · **Closes:** the ten findings of the fourth adversarial review round, and the reason there was a fourth round.

## The problem

Four adversarial review rounds on PR #109 each produced real findings, and they did not converge: each round landed in a region the previous ones had not entered, and severity did not decay — round four's lead finding (a lowercase letter in an environment variable silently revoking every live embedded link) is as serious as anything in round one.

Reviews that sample instead of converge are a symptom. The cause is that **this repository cannot distinguish a test that constrains behaviour from one that merely mentions it.** Three facts establish that:

1. `.claude/rules/testing.md` has a section titled *"What unit tests here cannot catch"* and ends with *"A test can be present, passing, and worthless."* The doctrine exists. Nothing enforces it.
2. `scripts/check-distribution-seed.mutants.mjs` runs 72 mutants in CI to prove a *gate script* is load-bearing. The repository invented the instrument that detects worthless tests — and pointed it only at its own tooling.
3. Mutation testing against product code found **17 surviving mutants**, every one in a source-text spec: the client-write refusal (`refuseClientCredentialWrites`) can be deleted outright, or inverted to permit arbitrary token writes, with the suite green. The delete-before-revoke ordering can be reversed. Seventy type errors exist in specs that nothing compiles.

Fail-soft provisioning compounds it: every defect in this subsystem is silent at runtime by design, so the only remaining detector is a person reading code — and reading samples.

## Goals

- Every confirmed positive from round four fixed, each pinned red first.
- The two load-bearing guards that survived mutation (`refuseClientCredentialWrites`, `Delete()` ordering) and the five Angular survivors constrained by **behavioural** tests.
- An instrument, running in CI, that fails when a declared load-bearing guard can be neutralised without a test going red.
- Specs type-checked in CI.
- Everything lands in #109, sequenced so each area is reviewable in one pass.

## Non-goals

- Converting the other 24 source-text specs in the repository. They are out of this PR's blast radius; the mutation instrument makes them reachable later.
- A PostgreSQL twin for the migrations (pre-existing gap, 25 of 30 migrations).
- A unique filtered index on `FormDistribution.MagicLinkInviteID`. Available as defence-in-depth for the reissue race; deferred because it is a migration and because the reissue fix below removes the window without one.

## Track 1 — defect fixes

Each fix is preceded by a failing test that reproduces the defect. Numbering follows the round-four report.

| # | File | Defect | Fix |
|---|---|---|---|
| 2 | `CoreEntitiesServer/src/magic-link/config.ts`, `Server/src/respondent-host/RespondentHostMiddleware.ts` | `channelsFromEnv` silently drops unrecognised tokens. Harmless as a mint gate; as an input to a state function it revokes every live link of the dropped channel on its next save | **Throw** on an unrecognised token, naming it and the valid set. The resolver has exactly two production callers. In `Save()` it is evaluated inside the `try`, so the throw is caught, logged, and the distribution save stands with no credential touched — fail-safe by construction. In `RespondentHostMiddleware`'s boot-time readiness check it is **not** in a `try`, and a bare throw would take down all of MJAPI (which also serves Caliber and ATS) over a Forms env-var typo; that call is wrapped so the failure is reported through the readiness log line that already exists for broken host config. `config.spec.ts` "ignores unknown tokens" is replaced by a test that expects the throw |
| 4 | `Angular/src/lib/builder/distribution-manager.component.ts` | `warnIfStillUnissued` / `warnIfStillRedeemable` overwrite `actionError` unconditionally, replacing a genuine save error with a false diagnosis ("magic links are not switched on") | Both helpers return early when `actionError` is already set |
| 6 | `Server/src/magic-link/MagicLinkInviteMinter.ts` | `RevokeAnonymousInvite` short-circuits only on `Revoked`, so it overwrites `Consumed` and `Expired` — which the migration and the sibling `SetAnonymousInviteExpiry` both say must not happen | Short-circuit on any status other than `Active`, returning `{ success: true, changed: false }`. The postcondition ("cannot be redeemed") already holds for every terminal status |
| 8 | same file | `sameInstant` treats a string as NaN → "different", while `asInstant` in the same file parses strings. A string `ExpiresAt` would rewrite the row on every save | `sameInstant` compares `asInstant(a)` |
| 9 | `Angular/src/lib/builder/share-state.ts` | `Draft` links badge "Paused … turning it **back** on" about a link that was never on | The paused detail distinguishes `Status === 'Draft'`: "Not yet turned on" copy, same fix button |
| 7 | `CoreEntitiesServer/src/magic-link/provision-runner.ts` | An invite whose `ResourceID` is NULL or foreign is refused on every save forever, and the log reads like a transient failure | Minter returns a distinguishable result (`refused: true`); runner maps it to a new outcome `revoke-refused-not-ours` with a log line that says it will not self-heal |
| 3 | same file | `realignExpiry` loads the invite on every save of every live link — including every public submission — and its docstring calls that "cheap" | **Docstring only.** The reviewer's proposed skip (when `closeAt` is null and no ceiling is set) is wrong: the stored expiry is not the sentinel when `CloseAt` was just *cleared* — round one's "Remove the expiry" defect — and a skip would also break the retry after an `expiry-update-failed`. The read is the mechanism by which the expiry stays in step and is kept; the docstring now states the cost honestly and why it is paid on every save |
| 10 | `scripts/check-distribution-seed.mjs` | CHECK 6's `MAX_TYPED_DECLARATION` matches any `@name NVARCHAR(MAX)`, including a stored-procedure parameter | Require `DECLARE` before the match. Add the two uncovered behaviours (the `\n\s*\n` terminator; the `migrations-teardown` scan) to the existing 72-mutant manifest |
| — | `.changeset/…`, PR body | "closing the typecheck gap needs five pre-existing errors fixed" — the number is 70 | Corrected, with the per-package table |

## Track 2 — design changes

### The reissue race (#5)

`runProvisioning` on a `reissue` decision performs two saves: `withdrawCredential` revokes the old invite and saves `(null, null)`; `issueCredential` mints and saves the new pair. Between those saves the row reads "live link, no credential". Any concurrent instance loading it — a second builder tab, a public submission bumping `ResponseCount` — decides `mint`, and two invites are minted; the loser's is left `Active` with nothing referencing it.

The intermediate save exists only because `withdrawCredential` unconditionally persists. On the reissue path it must not: revoke the old invite, then let `issueCredential`'s single save write the new pair. Failure semantics are unchanged in every direction that mattered before:

- revoke fails → nothing is written, the credential stays linked, the next save retries (as today);
- mint fails after a successful revoke → the credential is now dead and must be cleared, so *then* persist `(null, null)` — today's behaviour, reached only on the failure path.

One save in the common case; the window is gone. `withdrawCredential` is split: `revokeInvite` (revoke only, returns success/failure) and `withdrawCredential` (revoke, then unlink) for the non-reissue path. The reissue path calls `revokeInvite` then `issueCredential`; if the mint fails after a successful revoke it calls `persistCredential(null)` itself, because a dead credential must not stay linked.

### Test efficacy (#1)

**`FormDistributionEntityServer.spec.ts`** becomes behavioural for the guards that matter. The class extends the generated entity, which needs MJ metadata to construct — the same constraint `MagicLinkInviteMinter.spec.ts` already solves by mocking `@memberjunction/core`'s `Metadata` and the generated base. The spec instantiates the real subclass over a fake base whose `Save`, `Delete`, `GetFieldByName`, `IsSaved` and `ContextCurrentUser` are controlled, and asserts:

- a dirty `MagicLinkInviteID` from a client is restored to its old value before `super.Save` runs;
- a dirty non-empty `PublicLinkToken` is restored; a dirty *empty* one is kept;
- a credential supplied on create is stripped;
- `Delete()` calls `super.Delete` **before** `RevokeAnonymousInvite`, and does not revoke when `super.Delete` returns false;
- a throw from the runner leaves `credentialWriteInFlight` false.

The source-text assertions that remain are retitled to what they establish; the six titles the review named as overclaiming are corrected.

**`distribution-manager.spec.ts`** and **`distribution.service.ts`**: `DistributionService` has no constructor injection and is `new`-able under the existing `import '@angular/compiler'` pattern; the component is constructed via `runInInjectionContext(Injector.create({ providers }), () => new DistributionManagerComponent())` with stub `DistributionService`, `DomSanitizer` and `ChangeDetectorRef` — verified by spike in this environment. Behavioural tests cover the five survivors: `openForResponses` writes `IsActive = true` and passes `IgnoreDirtyState`; `reissueLink` clears only `PublicLinkToken`; `runCredentialWrite` reloads after the write; `applyFix('paused')` calls `open`.

## The instruments

### `scripts/check-guard-mutants.mjs`

The existing `check-distribution-seed.mutants.mjs` generalised from "mutate a gate script, run its spec" to "mutate a product source file, run the package suite". Its manifest is a list of:

```js
{ file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
  name: 'client-write-guard-neutralised',
  find: 'private refuseClientCredentialWrites(): void {\n    if (this.credentialWriteInFlight) {',
  replace: 'private refuseClientCredentialWrites(): void {\n    if (true) { return; }\n    if (this.credentialWriteInFlight) {',
  suite: 'packages/CoreEntitiesServer' }
```

For each entry: assert `find` occurs exactly once (a manifest that no longer matches is itself a failure), apply, run `npx vitest run` in `suite`, restore in a `finally`, and require a non-zero exit. A mutant that stays green fails the gate and names the guard. The initial manifest is every survivor the review found (11) plus each new behavioural test's subject. Wired as `lint:guard-mutants` and added to the `distribution-gate` CI job's siblings.

Cost: `CoreEntitiesServer`'s suite runs in ~0.3s and Angular's in a few seconds; a dozen mutants is under a minute.

### `npm run typecheck`

Each package gets `tsconfig.typecheck.json` — `extends` its `tsconfig.json`, `noEmit`, and an `exclude` that keeps `node_modules` and `dist` but **not** the spec globs — and a `typecheck` script running `tsc -p tsconfig.typecheck.json`. Root `typecheck` fans out through turbo. A `typecheck` job joins `build.yml`. The 70 errors (Entities 3, Server 32, Angular 35) are fixed first; they are mock-shape mismatches and `possibly undefined` narrowing, not product defects.

## Verification

- Every Track 1 fix: failing test observed red, then green.
- Every manifest entry: the mutation observed to leave the suite **green** before its behavioural test exists, and **red** after — the red-green cycle applied to the instrument itself.
- `npm test`, `pnpm run build:packages`, all five existing gates, the 72 existing mutants, the new guard mutants, `npm run typecheck`.
- `pnpm run smoke:credentials` (28) and `pnpm run smoke:credentials:least-privilege` (16) re-run against a booted server, since the reissue change touches the live write path.

## Sequencing — seven commits

1. **Defect fixes** — Track 1 rows 2, 6, 8, 9, 7, 3, 10 and the corrected claim. Small, independent, each with its red test. Row 4 is not here: its red test needs the component harness, so it lands with commit 4.
2. **Reissue race** — one save on the reissue path.
3. **Behavioural tests for the hook** — `FormDistributionEntityServer` over a fake base; the source-text sibling's titles corrected.
4. **Behavioural tests for the Distribute tab, and row 4** — service and component; the error-clobber fix pinned red against the new harness.
5. **Guard-mutant harness** — script, manifest, `lint:guard-mutants`, CI wiring.
6. **Typecheck errors** — the 70, mechanically.
7. **Typecheck gate** — per-package config, scripts, CI job.

## Risks

- **#2 changes a config's failure mode from silent to loud.** A host with a malformed `FORMS_MAGICLINK_CHANNELS` today has already had links revoked; after this it gets a log line per save and no provisioning until fixed. The changeset says so.
- **The reissue reorder touches the live write path.** Covered by both smokes and by `provision-runner.spec.ts`, which is one of the suites mutation testing showed to be genuinely strong.
- **`runInInjectionContext` is an Angular API, not a test utility.** It is stable and public; the spike ran clean. If a future Angular major changes it, the failure is a red test, not a silent one.
