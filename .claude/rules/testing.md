---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/__tests__/**"
---

# Unit Testing in bizapps-forms

**Vitest**, everywhere. Adapted from MemberJunction's rule and corrected against this repo on
2026-07-30 — several details differ, and following MJ's version verbatim would be wrong here.

## Running tests

```bash
npm test                    # every workspace, via turbo — 434 tests
npm run test:packages       # the five @mj-biz-apps/forms-* packages only
cd packages/Server && npx vitest run     # one package
cd packages/Server && npx vitest         # watch mode
npm run typecheck           # tsc --noEmit per package WITH specs included — nothing else compiles a test file
npm run lint:guard-mutants  # neutralise each declared load-bearing guard; its package suite must go red
```

> `npm test` did not exist until 2026-07-30. Every package had a `test` script but `turbo.json`
> declared no `test` task, so there was no way to run the suite from the root — which made it easy to
> believe a partial per-package loop was the whole thing. If `npm test` ever fails with *"Could not
> find task `test` in project"*, the `test` task has been dropped from `turbo.json`.

**`npm test` covers a workspace the per-package loop misses.** `apps/MJAPI` has its own tests. Looping
the five packages reports 432 and looks complete; the real total is **434**.

There is no `test:coverage` or `test:watch` script — use `npx vitest --coverage` / `npx vitest`
directly. MJ's rule lists both; they do not exist here.

## Conventions here (these differ from MJ core)

- Test files are **`.spec.ts`** in all five `packages/*`. The one exception is
  `apps/MJAPI/src/__tests__/index.test.ts`, which follows MJ's `.test.ts` convention because it came
  from the MJ app scaffold — leave it alone; new package tests use `.spec.ts`.
- Two placements, both in use:
  - **colocated** beside the source — `create-followup-task.action.spec.ts`
  - **`__tests__/`** subdirectory — `packages/Server/src/public-submit/__tests__/`

  Follow whichever the neighbouring code already uses.
- **`@memberjunction/test-utils` is not installed here.** MJ's rule tells you to use it; don't, unless
  you add it deliberately. Hand-rolled fakes are the established pattern —
  `packages/Server/src/public-submit/__tests__/fakes.ts` is worth copying.
- No database connections in unit tests. Stack-level checks live elsewhere (below).
- There is no `scripts/scaffold-tests.mjs` and no `guides/` directory — both are MJ-only.

## What unit tests here cannot catch

Version 0.2.1 shipped with the anonymous respondent path **completely broken** and the entire unit
suite green. Both defects were structurally invisible to unit tests: one was a case mismatch between a
GUID minted client-side and the same GUID read back from SQL Server; the other was a browser
performing its default form submit. Neither exists until a real server serves a real published form.

So a green `npm test` is necessary and **not sufficient** for anything touching the public path:

```bash
npm run smoke:binding:seed                        # seeds the binding fixtures the next two need
npm run smoke:respondent -- <distribution-slug>   # drives the real public surface end to end
npm run smoke:binding                             # entity binding: create / merge / match / ledger
npm run smoke:automation                          # WHETHER and IN WHAT ORDER an automation runs
npm run smoke:provenance                          # a file id cannot be claimed across sessions
npm run smoke:file-links                          # uploads attach to the response AND the bound record
npm run smoke:credentials                         # a revoked token no longer redeems; a delete is one transaction
npm run smoke:credentials:least-privilege         # the same, performed by an author with no rights on core's invite table
npm run smoke:backfill                            # the credential backfill migration, run verbatim and rolled back
npm run lint:generated                            # CodeGen scope gate
npm run lint:ui                                   # design-token gate
```

**Every script takes the distribution slug as its first argument, or `FORMS_SMOKE_SLUG`.** Given
neither, one is discovered from the database — the first published form carrying an Email question,
printed so a run always says which form it used. Nothing is hardcoded: the question ids each
fixture needs are resolved BY ROLE from whichever form was chosen (`smoke/lib/fixture.mjs`), so the
same suite runs against a contact form, a job application, or whatever a given database holds.

These used to name one fixture — a form at slug `contact-us-e2e`, plus the literal GUIDs of its
questions — which meant no other database could run them, and said so badly: a missing form
surfaced as `Conversion failed when converting from a character string to uniqueidentifier`, and a
present form with different questions produced `Submission is missing required value(s): Email`,
which reads like a product defect and never was one. If a fixture cannot be satisfied now, the
script says which form it looked at, what role it needed, and which slugs would have worked.

**None of these run in CI.** `smoke/**` appears in `build.yml`'s path filter, so editing one
triggers the workflow — but no job executes them: they need a live API, a SQL Server container and
a published form, which no build agent has. They are manual, and they are the only thing standing
between you and the failure class below.

> A publish bug once made entity binding completely inert — the snapshot never carried the
> configured automations, so no binding ever fired — while the whole unit suite AND the binding
> smoke test stayed green. The smoke test hand-wrote the `automations` JSON it spliced into the
> snapshot, so it asserted the snapshot's *contents* while stepping around the code that was
> supposed to produce them. **A fixture that reproduces the thing under test is not a test of it.**
> The seed now builds the snapshot with the same `buildPublishedAutomations` publish uses.

Also: `sqlcmd` exits **0** on a SQL error unless you pass `-b`, so a mistyped column name comes
back as error *text where data was expected* and flows onward as if it were a value. Every smoke
script passes `-b`. Keep it that way.

The smoke test is the one that would have caught 0.2.1. It deliberately submits using the
`formVersionId` read from the published snapshot — exactly what the widget sends — rather than one
queried from the database, because those two spellings of the same GUID differ in case.

## Writing tests

- Descriptive names that read as specifications, not as method names.
- Test **behaviour through public interfaces**, not internals. A test that breaks when you rename a
  private function was testing the wrong thing.
- Import from `vitest`: `import { describe, it, expect, vi, beforeEach } from 'vitest'`.
- When a test documents a contract rather than having driven the implementation, say so in a comment.
  Both are legitimate; conflating them makes a suite look more load-bearing than it is.
- **Assert the thing that was actually wrong.** The pre-existing version-mismatch test used
  `formVersionId: 'stale-version'` — a genuinely different string — so it passed regardless of case
  handling and never exercised the bug that shipped. A test can be present, passing, and worthless.
- **A test that reads source text asserts presence, not behaviour.** It cannot see a condition or a
  sequence. Mutation testing found seventeen guards this repo's own comments call load-bearing that
  could be deleted with the suite green, every one behind a `readFileSync` spec. If the class can be
  instantiated — `vi.mock` the generated base; `runInInjectionContext(Injector.create(...))` for a
  component with field `inject()`; bare `new` for a service without constructor injection — test the
  behaviour and add the guard to `scripts/check-guard-mutants.mjs`. Reserve source-text for template
  text and for the cheap "the call still exists" smoke, and title it as exactly that.
- **Specs are type-checked** (`npm run typecheck`, and in CI). A spec calling a signature that no
  longer exists used to compile, run and pass for the wrong reason; seventy such errors were found the
  day the gate was added, two of them in specs written that morning.

## Keeping tests green is your job

When you change a package's source, run its tests and fix what your change broke. If a test fails
because the new behaviour is correct, update the test. Never leave a broken test behind.

## CI

`.github/workflows/build.yml` (*Build and Test*) runs `npm test` on every push and PR to `next`.

> Until 2026-07-30 **no workflow ran any tests** — all 434 could have been red and a PR would still
> have gone green. If you are adding a workflow, check it actually runs something.

Its path filter now includes `apps/**`, `scripts/**`, `smoke/**`, `turbo.json` and `package.json`;
previously only `packages/**` and `package-lock.json` triggered it, so a change breaking MJAPI or a
gate script never ran CI at all.
