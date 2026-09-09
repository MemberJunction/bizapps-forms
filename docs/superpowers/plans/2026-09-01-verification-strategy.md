# Verification Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every confirmed positive from PR #109's fourth adversarial review, and add the two instruments (guard-mutation gate, spec typecheck gate) that stop the class from recurring.

**Architecture:** Defect fixes land first against the suites mutation testing proved strong. The two source-text spec files gain behavioural siblings built on instantiation techniques verified by spike (`vi.mock` of the generated base for the entity hook; `runInInjectionContext(Injector.create(...))` for the component). A mutation manifest then pins each guard, and a per-package `tsc --noEmit` including specs closes the type gap.

**Tech Stack:** TypeScript, Vitest 4, Angular 21 (`runInInjectionContext`), Node stdlib for gate scripts, turbo, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-01-verification-strategy-design.md`

## Global Constraints

- No `any`, no `unknown` as a lazy alternative, no `as any` (CLAUDE.md rule 2). Test doubles are typed through narrow interfaces.
- Never hand-edit `packages/*/src/generated/**`.
- Every fix is preceded by a test observed **red**; every new mutant is observed to leave the suite **green** before its test exists and **red** after.
- Commits only as this plan states them; the user approved this sequence. Run from the worktree root `/Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-104` — `cd` explicitly at the start of every command, the shell cwd resets between calls.
- Commit trailers: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01L25ewntwnavMB5G8gAmnQK`.
- Run a package's tests with `cd packages/<Pkg> && npx vitest run <file>`; the whole suite with `TURBO_FORCE=1 npm test` from the root.

---

## Commit 1 — Defect fixes

### Task 1: `FORMS_MAGICLINK_CHANNELS` refuses an unrecognised token instead of silently narrowing (#2)

**Files:**
- Modify: `packages/CoreEntitiesServer/src/magic-link/config.ts:112-124` (`channelsFromEnv`)
- Modify: `packages/CoreEntitiesServer/src/magic-link/__tests__/config.spec.ts:37-42`
- Modify: `packages/Server/src/respondent-host/host-readiness.ts:55-58` (`checkRespondentReadiness` second parameter)
- Modify: `packages/Server/src/respondent-host/RespondentHostMiddleware.ts:97-100`
- Test: `packages/Server/src/public-submit/__tests__/host-readiness.spec.ts`

**Interfaces:**
- Produces: `checkRespondentReadiness(magicLink, resolveRoleName: () => string = () => RESPONDENT_ROLE): RespondentReadiness` — the second parameter becomes a thunk so the readiness check owns the "config cannot be resolved" case.

- [ ] **Step 1: Write the failing config test**

In `config.spec.ts`, replace the `'honors a custom channel allow-list and ignores unknown tokens'` case with:

```ts
  it('honors a custom channel allow-list', () => {
    process.env.FORMS_MAGICLINK_CHANNELS = 'PublicLink, QR';
    resetMagicLinkProvisioningConfigForTests();
    const c = getMagicLinkProvisioningConfig();
    expect([...c.linkableChannels].sort()).toEqual(['PublicLink', 'QR']);
  });

  it('REFUSES an unrecognised channel token, naming it, rather than silently dropping it', () => {
    // This used to be tolerated ("ignores unknown tokens"), and that was correct while the list
    // was a mint GATE: an ignored token meant "mint nothing new for it". `decideProvisioning` is
    // a state function now, so a channel missing from the set means every live link of that
    // channel is unwarranted, and the next save of each — typically a respondent submitting —
    // revokes its credential. `embed` for `Embed` would take every embedded form on the host
    // dark with no error anywhere. Refusing is fail-safe by construction: the one save-path
    // caller evaluates this inside a try, so a throw leaves every credential exactly as it was.
    process.env.FORMS_MAGICLINK_CHANNELS = 'PublicLink, embed ,QR';
    resetMagicLinkProvisioningConfigForTests();
    expect(() => getMagicLinkProvisioningConfig()).toThrow(/embed/);
    expect(() => getMagicLinkProvisioningConfig()).toThrow(/Email, Embed, PublicLink, QR/);
  });
```

- [ ] **Step 2: Run it red**

Run: `cd packages/CoreEntitiesServer && npx vitest run src/magic-link/__tests__/config.spec.ts`
Expected: FAIL — `expected [Function] to throw` on the REFUSES case.

- [ ] **Step 3: Implement**

Replace `channelsFromEnv` in `config.ts`:

```ts
/**
 * Parse the channel allow-list. An unrecognised token is REFUSED, not ignored.
 *
 * Ignoring was correct while this set was a mint gate — an unknown token meant "mint nothing new
 * for it". `decideProvisioning` reads it as a state function now, so a channel absent from the
 * set is a channel whose live links are unwarranted, and the next save of each revokes its
 * credential. A lowercase `embed` would take every embedded form on the host dark, silently, on
 * the next respondent submission. Throwing is fail-safe: the save-path caller evaluates this
 * inside its `try`, so a malformed list leaves every credential untouched and logs on each save;
 * the boot-time caller reports it through the respondent readiness line.
 */
function channelsFromEnv(key: string): ReadonlySet<DistributionChannelType> {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return new Set(DEFAULT_CHANNELS);
  }
  const valid = new Set<string>(ALL_CHANNELS);
  const tokens = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  const unknown = tokens.filter((t) => !valid.has(t));
  if (unknown.length > 0) {
    throw new Error(
      `${key} contains ${unknown.map((t) => `'${t}'`).join(', ')}, which is not a distribution channel. ` +
        `Valid values (case-sensitive): ${ALL_CHANNELS.join(', ')}. Refusing to provision until this is fixed, ` +
        `because a narrowed list REVOKES the credentials of every live link outside it.`,
    );
  }
  const parsed = tokens as DistributionChannelType[];
  return parsed.length > 0 ? new Set(parsed) : new Set(DEFAULT_CHANNELS);
}
```

Also update the file header's `FORMS_MAGICLINK_CHANNELS` bullet to end with: `An unrecognised token is refused (thrown), never ignored — see channelsFromEnv.`

- [ ] **Step 4: Run it green**

Run: `cd packages/CoreEntitiesServer && npx vitest run src/magic-link/__tests__/config.spec.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Write the failing readiness test**

Append to `packages/Server/src/public-submit/__tests__/host-readiness.spec.ts`, inside the existing top-level `describe`:

```ts
  it('reports a provisioning config that cannot be resolved as NOT ready, instead of throwing', () => {
    // The boot-time caller is not inside a try. A throw there takes down all of MJAPI — which
    // also serves Caliber and ATS — over a Forms env-var typo. The readiness line is exactly
    // where broken host config is meant to surface, so the check owns this case.
    const readiness = checkRespondentReadiness(
      { enabled: true, grantableRoleNames: ['Form Respondent'] },
      () => {
        throw new Error("FORMS_MAGICLINK_CHANNELS contains 'embed'");
      },
    );
    expect(readiness).toEqual({ ready: false, reason: expect.stringContaining("'embed'") });
  });
```

- [ ] **Step 6: Run it red**

Run: `cd packages/Server && npx vitest run src/public-submit/__tests__/host-readiness.spec.ts`
Expected: FAIL — either a type/arity error on the thunk or the thrown error escaping.

- [ ] **Step 7: Implement the thunk**

In `host-readiness.ts`, change the signature and the first lines:

```ts
export function checkRespondentReadiness(
  magicLink: HostMagicLinkConfig | undefined,
  resolveRoleName: () => string = () => RESPONDENT_ROLE,
): RespondentReadiness {
  // Resolved HERE, under this check's own guard, rather than by the caller: the provisioning
  // config refuses a malformed channel list by throwing, and the boot-time caller is the one
  // place that must not propagate a throw. "Is the respondent path ready?" includes "can its
  // config be read at all?", so this is where that answer belongs.
  let roleName: string;
  try {
    roleName = resolveRoleName();
  } catch (e) {
    return { ready: false, reason: e instanceof Error ? e.message : String(e) };
  }
```

Then update every existing test in `host-readiness.spec.ts` that passes a role-name string as the second argument to pass `() => 'that string'` instead (grep `checkRespondentReadiness(` in that spec).

In `RespondentHostMiddleware.ts:97-100` change the call to:

```ts
    const readiness = checkRespondentReadiness(
      configInfo.magicLink,
      () => getMagicLinkProvisioningConfig().roleName,
    );
```

- [ ] **Step 8: Run green, then build**

Run: `cd packages/Server && npx vitest run src/public-submit/__tests__/host-readiness.spec.ts && pnpm run build`
Expected: PASS; `tsc` exit 0.

### Task 2: `RevokeAnonymousInvite` leaves `Consumed` / `Expired` as they ended (#6)

**Files:**
- Modify: `packages/Server/src/magic-link/MagicLinkInviteMinter.ts` (`RevokeAnonymousInvite` change callback)
- Test: `packages/Server/src/magic-link/__tests__/MagicLinkInviteMinter.spec.ts` (`RevokeAnonymousInvite` describe)

- [ ] **Step 1: Write the failing test**

Add inside `describe('MagicLinkInviteMinter.RevokeAnonymousInvite', …)`:

```ts
  it.each(['Consumed', 'Expired'] as const)(
    'leaves a %s invite exactly as it ended — a terminal status is already unredeemable',
    async (status) => {
      // The migration refuses to overwrite these ("would claim an operator action that never
      // happened") and `SetAnonymousInviteExpiry` refuses too. This method was the odd one out.
      mockState.loadedStatus = status;
      const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
      expect(result).toMatchObject({ success: true, changed: false });
      expect(mockState.lastSavedInvite).toBeUndefined();
    },
  );
```

- [ ] **Step 2: Run red** — `cd packages/Server && npx vitest run src/magic-link/__tests__/MagicLinkInviteMinter.spec.ts` → FAIL: `lastSavedInvite` is defined with `Status: 'Revoked'`.

- [ ] **Step 3: Implement** — in `RevokeAnonymousInvite`, replace the callback's first check:

```ts
      if (invite.Status !== 'Active') {
        // Any status other than Active is already unredeemable — `evaluateInvite` refuses all of
        // them — so the postcondition holds and nothing is written. Overwriting a `Consumed` or
        // `Expired` row with `Revoked` would claim an operator action that never happened, which
        // is the rule the backfill migration and `SetAnonymousInviteExpiry` already follow.
        return { verdict: 'settled', message: `Invite ${invite.ID} is ${invite.Status}; already unredeemable.` };
      }
```

Update the docstring sentence "an invite that is already `Revoked`, or whose row has genuinely been deleted, is a success that writes nothing" to "an invite in any terminal status, or whose row has genuinely been deleted, is a success that writes nothing".

- [ ] **Step 4: Run green** — same command → PASS (the existing `is idempotent on an already-revoked invite` case still passes).

### Task 3: `sameInstant` reads a string the way `asInstant` does (#8)

**Files:** same two as Task 2.

- [ ] **Step 1: Failing test** — inside `describe('MagicLinkInviteMinter.SetAnonymousInviteExpiry', …)`:

```ts
  it('treats a stored expiry that arrives as an ISO string as the same instant, not as "different"', async () => {
    // `asInstant` two functions up handles "a value the store may hand back as a Date or as a
    // string". `sameInstant` did not, so a string would never compare equal, the row would be
    // rewritten on every save, and the expiry would "walk forward forever" in a new guise.
    mockState.loadedExpiresAt = '2026-10-01T00:00:00.000Z' as unknown as Date;
    const result = await new MagicLinkInviteMinter().SetAnonymousInviteExpiry(
      CRED,
      { closeAt: new Date('2026-10-01T00:00:00.000Z'), maxLifetimeHours: undefined },
      contextUser,
    );
    expect(result).toMatchObject({ success: true, changed: false });
  });
```

(The `as unknown as Date` here models the store's behaviour the production code explicitly documents; it is the one place a cast is the honest way to say "the type lies".)

- [ ] **Step 2: Run red** → FAIL: `changed: true`.

- [ ] **Step 3: Implement**:

```ts
/** Whether two instants are the same, treating an unparseable stored value as "different". */
function sameInstant(a: Date | string | null | undefined, b: Date): boolean {
  const left = asInstant(a);
  return left !== null && left.getTime() === b.getTime();
}
```

(`asInstant` must be declared above it or hoisting covers it — function declarations hoist; keep the order as-is.)

- [ ] **Step 4: Run green** → PASS.

### Task 4: An ownership refusal is reported as permanent, not retryable (#7)

**Files:**
- Modify: `packages/CoreEntitiesServer/src/magic-link/minter.ts` (`InviteWriteResult`)
- Modify: `packages/Server/src/magic-link/MagicLinkInviteMinter.ts` (`writeToInvite` ownership branch)
- Modify: `packages/CoreEntitiesServer/src/magic-link/provision-runner.ts` (`ProvisionOutcome`, `withdrawCredential`, `runProvisioning`)
- Test: `MagicLinkInviteMinter.spec.ts`, `provision-runner.spec.ts`

**Interfaces:**
- Produces: `InviteWriteResult.refused?: true` — "the implementation declined because the credential does not belong to `resourceId`; retrying will not change the answer". `ProvisionOutcome.result` gains `'revoke-refused-not-ours'`.

- [ ] **Step 1: Failing minter test** — in the ownership `describe` at the end of `MagicLinkInviteMinter.spec.ts`:

```ts
  it('marks an ownership refusal as REFUSED, so the caller can tell it from a failure a retry will fix', async () => {
    mockState.loadedResourceID = 'someone-elses-distribution';
    const result = await new MagicLinkInviteMinter().RevokeAnonymousInvite(CRED, contextUser);
    expect(result).toMatchObject({ success: false, changed: false, refused: true });
  });
```

- [ ] **Step 2: Run red** → FAIL: `refused` undefined.

- [ ] **Step 3: Implement** — `minter.ts`, add to `InviteWriteResult`:

```ts
  /**
   * True when the implementation DECLINED rather than failed: the invite is not scoped to the
   * resource it was asked on behalf of. Retrying cannot change that answer, so a caller that
   * retries on failure must not treat this as one — it is the row that is wrong, not the moment.
   */
  refused?: true;
```

`MagicLinkInviteMinter.ts` ownership branch: `return { success: false, changed: false, refused: true, message };`

- [ ] **Step 4: Run green** → PASS.

- [ ] **Step 5: Failing runner test** — in `provision-runner.spec.ts` after the `still reports revoke-failed…` case:

```ts
  it('reports an ownership refusal as its own outcome, because a retry will never fix it', async () => {
    // `revoke-failed` means "try again on the next save". A NULL or foreign `ResourceID` — the
    // population the backfill migration deliberately leaves alone — is refused on EVERY save,
    // and a log that reads like a transient failure sends an operator waiting for a retry
    // that will never land. The token stays on the record and stays redeemable meanwhile.
    const fake = fakeMinter(undefined, { success: false, changed: false, refused: true, message: 'not ours' });
    const persist = vi.fn(async () => true);
    const outcome = await runProvisioning(livingCtx({ status: 'Closed' }), config, fake.minter, contextUser, persist);
    expect(outcome).toEqual({ result: 'revoke-refused-not-ours', inviteId: OLD_INVITE });
    expect(persist).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run red** → FAIL: result is `revoke-failed`.

- [ ] **Step 7: Implement** — `provision-runner.ts`:

Add `| 'revoke-refused-not-ours'` to `ProvisionOutcome['result']` after `'revoke-failed'`, with the doc comment `/** The minter refused: the invite is not scoped to this distribution. Will not self-heal. */`.

Change `withdrawCredential`'s return type to `Promise<'withdrawn' | 'revoke-failed' | 'revoke-refused-not-ours' | 'unlink-failed'>` and its revoke-failure branch to:

```ts
  if (!revoked.success) {
    if (revoked.refused) {
      LogError(
        `[FormDistribution] Refused to revoke magic-link invite ${inviteId} for distribution ` +
          `${ctx.distributionId}: ${revoked.message ?? 'not scoped to this distribution'}. This will NOT ` +
          `self-heal on a later save — the invite's ResourceID does not name this distribution. Its ` +
          `token may still redeem. Reissue the link, or correct the row by hand.`,
      );
      return 'revoke-refused-not-ours';
    }
    LogError( /* existing revoke-failed message unchanged */ );
    return 'revoke-failed';
  }
```

`runProvisioning`'s `if (withdrawn !== 'withdrawn') return { result: withdrawn, … }` already passes the new value through — no change.

- [ ] **Step 8: Run green** — `cd packages/CoreEntitiesServer && npx vitest run` → PASS. Then `cd packages/Server && pnpm run build` → exit 0.

### Task 5: `realignExpiry`'s docstring stops calling the read "cheap" (#3)

**Files:** `packages/CoreEntitiesServer/src/magic-link/provision-runner.ts` — the `realignExpiry` docstring only.

- [ ] **Step 1: Replace the docstring**

```ts
/**
 * Keep a credential we are not replacing bounded by the link it belongs to.
 *
 * Runs on every save of a live, credentialled distribution — which includes every public
 * submission, since submitting bumps `ResponseCount`. Each run LOADS THE INVITE ROW: that is
 * one core-entity read per save, on the anonymous hot path, and it is the price of the
 * expiry staying in step. It cannot be skipped on "nothing to re-bound" without reading the
 * row, because the distribution does not record the credential's expiry: when `CloseAt` was
 * just cleared the stored value is the OLD date, not the sentinel, and when a previous
 * re-bound failed this save is its retry. A round-four review proposed skipping when
 * `closeAt` is null and no ceiling is set; that reintroduces round one's "Remove the expiry"
 * defect and breaks the retry. So the read stays, and this comment says what it costs.
 *
 * Silent when nothing moved, which is what the minter's `{ changed: false }` reports after
 * the read. Missing minter or user is not an error here: there is nothing to correct that a
 * later save cannot correct, and this path must never turn an ordinary rename into a logged
 * failure.
 */
```

- [ ] **Step 2: Run the runner spec** — `cd packages/CoreEntitiesServer && npx vitest run` → PASS (no behaviour change).

### Task 6: A `Draft` link is not told to turn itself "back" on (#9)

**Files:**
- Modify: `packages/Angular/src/lib/builder/share-state.ts` (`pausedDetail`)
- Test: `packages/Angular/src/lib/builder/share-state.spec.ts`

- [ ] **Step 1: Failing test** — append a `describe`:

```ts
describe('a link that was never turned on is not told to turn itself back on', () => {
  it('gives a Draft link its own detail, with no claim about a withdrawal', () => {
    // `Draft` is the column's own default, so an Action or an import lands here. The static
    // paused copy says "while it is off" and "turning it back on" about a link that was never
    // on, and reads as if something was withdrawn. Nothing was.
    const draft = shareState(link({ Status: 'Draft', IsActive: true, PublicLinkToken: null }), NOW);
    expect(draft.kind).toBe('paused');
    expect(draft.detail).toMatch(/not been turned on/i);
    expect(draft.detail).not.toMatch(/back on/);
    expect(draft.detail).not.toMatch(/withdraw/i);
  });
});
```

- [ ] **Step 2: Run red** — `cd packages/Angular && npx vitest run src/lib/builder/share-state.spec.ts` → FAIL: `detail` undefined.

- [ ] **Step 3: Implement** — replace `pausedDetail`'s first lines:

```ts
function pausedDetail(facts: ShareLinkFacts): string | null {
  if (facts.Status === 'Draft' && !facts.PublicLinkToken) {
    // Never on, nothing withdrawn: the column's default, where an Action or an import lands.
    return 'This link has not been turned on yet. Turn it on to issue its web address.';
  }
  if (!credentialMayStillRedeem(facts)) {
    return null;
  }
```

- [ ] **Step 4: Run green** → PASS.

### Task 7: CHECK 6 only reads a `DECLARE`, and its two unpinned behaviours get mutants (#10)

**Files:**
- Modify: `scripts/check-distribution-seed.mjs:1276` (`MAX_TYPED_DECLARATION`)
- Modify: `scripts/check-distribution-seed.spec.mjs` (add one case)
- Modify: `scripts/check-distribution-seed.mutants.mjs` (`MUTANTS`, three entries)

- [ ] **Step 1: Failing gate spec case** — find the CHECK 6 cases in `check-distribution-seed.spec.mjs` (grep `findMaxTypedExtendedPropertyValues`) and add beside them:

```js
    test('CHECK 6 ignores a stored-procedure PARAMETER typed NVARCHAR(MAX) — only a DECLARE is a variable', () => {
        const sql = [
            `CREATE PROCEDURE [x].[spThing] @Value NVARCHAR(MAX) AS BEGIN SELECT 1 END;`,
            `EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'a literal', @level0type = N'SCHEMA';`,
        ].join('\n');
        assert.deepEqual(findMaxTypedExtendedPropertyValues(sql), []);
    });
```

- [ ] **Step 2: Run red** — `node scripts/check-distribution-seed.spec.mjs` → one failure: the parameter `@Value` is collected and `@value` in the call is matched to it.

- [ ] **Step 3: Implement** — change the regex:

```js
const MAX_TYPED_DECLARATION = /\bDECLARE\s+(@[A-Za-z0-9_]+)\s+(?:AS\s+)?((?:N?VARCHAR|VARBINARY)\s*\(\s*MAX\s*\)|XML\b)/gi;
```

and correct the comment `// A parameter NAME is also an @identifier; … and @value itself is never declared` to `// Only a DECLAREd variable is collected, so a procedure parameter that happens to be named @Value is not mistaken for the argument.`

- [ ] **Step 4: Run green** → `node scripts/check-distribution-seed.spec.mjs` passes; `npm run lint:distribution` passes.

- [ ] **Step 5: Add three mutants** — in `MUTANTS`, after `sqlvariant/proc-restriction`:

```js
    ['sqlvariant/declare-only', 'only a DECLAREd variable is a MAX-typed candidate, so a procedure parameter named @Value cannot be mistaken for the argument',
        `const MAX_TYPED_DECLARATION = /\\bDECLARE\\s+(@[A-Za-z0-9_]+)`,
        `const MAX_TYPED_DECLARATION = /(@[A-Za-z0-9_]+)`],
    ['sqlvariant/blank-line-terminates', 'a blank line ends an unterminated call, so a missing semicolon cannot swallow the rest of the file into one argument list',
        `const terminator = sql.slice(from).search(/;|\\n\\s*\\n|^\\s*GO\\s*$/m);`,
        `const terminator = sql.slice(from).search(/;|^\\s*GO\\s*$/m);`],
    ['sqlvariant/teardown-scanned', 'migrations-teardown is scanned by CHECK 6 too — a teardown that cannot execute is as fatal as an install that cannot',
        `for (const dirName of [...SHIPPED_MIGRATION_DIRS, 'migrations-teardown']) {`,
        `for (const dirName of [...SHIPPED_MIGRATION_DIRS]) {`],
```

- [ ] **Step 6: Run the harness and read the result** — `npm run lint:distribution:mutants`. Expected: `declare-only` KILLED by the new case. If `blank-line-terminates` or `teardown-scanned` report **SURVIVED**, add the spec case that kills each:

```js
    test('CHECK 6 stops an unterminated call at a blank line', () => {
        const sql = [
            `DECLARE @d NVARCHAR(MAX) = N'x';`,
            `EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'literal'`,
            ``,
            `SELECT @d;`,
        ].join('\n');
        assert.deepEqual(findMaxTypedExtendedPropertyValues(sql), []);
    });
```

(for the teardown scan, follow the shape of the existing `placeholder/teardown-map` case in the spec — a temp repo tree with a `migrations-teardown/` file containing the violation, asserting the gate reports it.)

Re-run until all three are KILLED and the total reads 75.

### Task 8: The changeset stops claiming "five" type errors

**Files:** `.changeset/link-credential-dies-with-the-link.md`

- [ ] **Step 1: Edit** — find `closing it repo-wide first needs five pre-existing errors fixed in unrelated specs` (in the "Three tests were asserting…" paragraph) and replace `five pre-existing errors fixed in unrelated specs` with `seventy pre-existing errors fixed in unrelated specs — Entities 3, Server 32, Angular 35, none in the two packages this branch is about — which this branch now does (see below)`.

### Task 9: Verify and commit

- [ ] **Step 1:** `cd <root> && TURBO_FORCE=1 pnpm run build:packages && TURBO_FORCE=1 npm test 2>&1 | grep -E "Tests |Tasks:"` — expect 10/10, every package green.
- [ ] **Step 2:** `for g in lint:migrations lint:distribution lint:ui lint:generated lint:distribution:mutants; do npm run $g; done` — all pass; mutants reads `75`.
- [ ] **Step 3:** Commit:

```bash
git add packages/CoreEntitiesServer/src/magic-link/config.ts packages/CoreEntitiesServer/src/magic-link/__tests__/config.spec.ts \
  packages/Server/src/respondent-host/host-readiness.ts packages/Server/src/respondent-host/RespondentHostMiddleware.ts \
  packages/Server/src/public-submit/__tests__/host-readiness.spec.ts \
  packages/Server/src/magic-link/MagicLinkInviteMinter.ts packages/Server/src/magic-link/__tests__/MagicLinkInviteMinter.spec.ts \
  packages/CoreEntitiesServer/src/magic-link/minter.ts packages/CoreEntitiesServer/src/magic-link/provision-runner.ts \
  packages/CoreEntitiesServer/src/magic-link/__tests__/provision-runner.spec.ts \
  packages/Angular/src/lib/builder/share-state.ts packages/Angular/src/lib/builder/share-state.spec.ts \
  scripts/check-distribution-seed.mjs scripts/check-distribution-seed.spec.mjs scripts/check-distribution-seed.mutants.mjs \
  .changeset/link-credential-dies-with-the-link.md \
  docs/superpowers/specs/2026-09-01-verification-strategy-design.md docs/superpowers/plans/2026-09-01-verification-strategy.md
git commit -F - <<'EOF'
fix(magic-link): eight confirmed defects from the fourth review, each pinned red first

A malformed FORMS_MAGICLINK_CHANNELS is refused instead of silently narrowing the set —
which, now that the list feeds a state function, revoked every live link of the dropped
channel on its next save. Fail-safe by construction on the save path (evaluated inside
the try) and reported through the readiness line at boot, where a bare throw would have
taken down all of MJAPI over a Forms typo.

RevokeAnonymousInvite leaves Consumed and Expired as they ended, as its sibling and the
migration already do. sameInstant reads a string the way asInstant does. An ownership
refusal is reported as revoke-refused-not-ours, since no retry will change it. A Draft
link is no longer told to turn itself "back" on. CHECK 6 collects only DECLAREd
variables, and its two unpinned behaviours now have mutants.

realignExpiry's docstring no longer calls a per-submission invite read "cheap"; the
review's proposed skip would have reintroduced round one's cleared-CloseAt defect and
broken the retry, so the read stays and the cost is stated.

The changeset's "five pre-existing type errors" is corrected to seventy.

Also adds the design spec and plan this and the following commits implement.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L25ewntwnavMB5G8gAmnQK
EOF
```

---

## Commit 2 — The reissue race

### Task 10: A reissue is one save, not two (#5)

**Files:**
- Modify: `packages/CoreEntitiesServer/src/magic-link/provision-runner.ts` (`runProvisioning`, `withdrawCredential`)
- Test: `packages/CoreEntitiesServer/src/magic-link/__tests__/provision-runner.spec.ts`

**Interfaces:**
- Produces: `revokeInvite(ctx, minter, contextUser): Promise<'revoked' | 'revoke-failed' | 'revoke-refused-not-ours'>` — revoke only, no persist. `withdrawCredential` composes it with the unlink for the non-reissue path.

- [ ] **Step 1: Change the pinned test** — in `runProvisioning — reissuing`, the first case's last assertion currently pins the race:

```ts
    // Cleared first, then written: the record never points at two credentials at once.
    expect(persist.mock.calls).toEqual([[null], [{ inviteId: 'invite-new', rawToken: 'mj_ml_new' }]]);
```

Replace with:

```ts
    // ONE save, carrying the new pair. There used to be two — clear, then write — and the
    // moment between them read as "live link, no credential" to any concurrent load, which
    // then minted a second invite and left the loser Active and unreferenced. The invariant
    // "never points at two credentials" holds trivially here: the old pair is replaced by the
    // new in a single write, and the old invite was revoked before that write.
    expect(persist.mock.calls).toEqual([[{ inviteId: 'invite-new', rawToken: 'mj_ml_new' }]]);
```

And add a case:

```ts
  it('never persists an intermediate "no credential" state on the reissue path', async () => {
    // The concurrency window, stated as a property of the write sequence rather than by
    // racing two instances: no persist call carries null unless the mint has failed.
    const fake = fakeMinter();
    const persist = vi.fn(async () => true);
    await runProvisioning(livingCtx({ publicLinkToken: null }), config, fake.minter, contextUser, persist);
    expect(persist.mock.calls.some(([value]) => value === null)).toBe(false);
  });
```

- [ ] **Step 2: Run red** — `cd packages/CoreEntitiesServer && npx vitest run src/magic-link/__tests__/provision-runner.spec.ts` → 2 FAIL.

- [ ] **Step 3: Implement** — in `provision-runner.ts`:

Extract the revoke half of `withdrawCredential` into:

```ts
/**
 * Kill the linked invite. Reports which of three things happened; never touches the record.
 *
 * Split from {@link withdrawCredential} so the reissue path can revoke WITHOUT the intermediate
 * unlink save. That save was the concurrency window: between "cleared" and "written with the
 * new pair", a concurrent load read "live link, no credential", minted a second invite, and
 * left one of the two Active and unreferenced — the orphan #104 exists to remove, produced by
 * the act of rotating.
 */
async function revokeInvite(
  ctx: ProvisionContext,
  minter: IAnonymousMagicLinkMinter,
  contextUser: UserInfo,
): Promise<'revoked' | 'revoke-failed' | 'revoke-refused-not-ours'> {
  const inviteId = ctx.magicLinkInviteId?.trim();
  if (!inviteId) {
    LogError( /* the existing "Asked to revoke … which has no MagicLinkInviteID" message */ );
    return 'revoke-failed';
  }
  const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: ctx.distributionId }, contextUser);
  if (!revoked.success) {
    /* the two LogError branches from Task 4, unchanged */
    return revoked.refused ? 'revoke-refused-not-ours' : 'revoke-failed';
  }
  return 'revoked';
}
```

`withdrawCredential` becomes:

```ts
async function withdrawCredential(
  ctx: ProvisionContext,
  minter: IAnonymousMagicLinkMinter,
  contextUser: UserInfo,
  persistCredential: PersistCredential,
): Promise<'withdrawn' | 'revoke-failed' | 'revoke-refused-not-ours' | 'unlink-failed'> {
  const revoked = await revokeInvite(ctx, minter, contextUser);
  if (revoked !== 'revoked') {
    return revoked;
  }
  if (!(await persistCredential(null))) {
    LogError( /* existing "Revoked … but could not clear" message */ );
    return 'unlink-failed';
  }
  return 'withdrawn';
}
```

In `runProvisioning`, replace the `if (decision.revoke) { … }` block:

```ts
  if (decision.revoke && decision.mint) {
    // Reissue: revoke, then let the mint's single save write the new pair. No unlink save in
    // between — see revokeInvite for the race it opened.
    const revoked = await revokeInvite(ctx, minter, contextUser);
    if (revoked !== 'revoked') {
      return { result: revoked, inviteId: ctx.magicLinkInviteId ?? undefined };
    }
    return issueCredential(ctx, config, minter, contextUser, persistCredential, decision.reason, {
      clearOnMintFailure: true,
    });
  }
  if (decision.revoke) {
    const withdrawn = await withdrawCredential(ctx, minter, contextUser, persistCredential);
    if (withdrawn !== 'withdrawn') {
      return { result: withdrawn, inviteId: ctx.magicLinkInviteId ?? undefined };
    }
    LogStatus( /* existing "Revoked … the link now holds no credential" message */ );
    return { result: 'revoked', inviteId: ctx.magicLinkInviteId ?? undefined };
  }
  return issueCredential(ctx, config, minter, contextUser, persistCredential, decision.reason, {
    clearOnMintFailure: false,
  });
```

`issueCredential` gains a last parameter `{ clearOnMintFailure }: { clearOnMintFailure: boolean }`. In its mint-failure branch (`if (!mint.success || !mint.inviteId || !mint.rawToken)`), before `return { result: 'mint-failed' }`:

```ts
    if (clearOnMintFailure) {
      // The old invite is already revoked. A dead credential must not stay linked — that is the
      // one direction the design refuses to fail in — so this is the only path that writes the
      // intermediate null, and only after the mint has failed.
      if (!(await persistCredential(null))) {
        LogError(
          `[FormDistribution] Revoked magic-link invite ${ctx.magicLinkInviteId} but could not clear it from ` +
            `distribution ${ctx.distributionId} after the replacement mint failed. The invite is dead; the ` +
            `distribution still points at it until the next save clears it.`,
        );
        return { result: 'unlink-failed', inviteId: ctx.magicLinkInviteId ?? undefined };
      }
    }
```

- [ ] **Step 4: Run green** → PASS, including `leaves the link credential-less when the replacement mint fails after a successful revoke` (still `persist` called once with `null`, now from the failure path).

- [ ] **Step 5: Build and commit**

```bash
cd packages/CoreEntitiesServer && pnpm run build && cd ../.. && git add packages/CoreEntitiesServer/src/magic-link/provision-runner.ts packages/CoreEntitiesServer/src/magic-link/__tests__/provision-runner.spec.ts
git commit -F - <<'EOF'
fix(magic-link): a reissue is one save, closing the window that double-minted

The reissue path saved twice — (null, null), then the new pair — and between those two
writes the row read as "live link, no credential" to any concurrent instance: a second
builder tab, or a public submission bumping ResponseCount. That instance decided mint,
and two invites were minted; the loser stayed Active with nothing referencing it, the
orphan #104 exists to remove, produced by the act of rotating.

revokeInvite is split out of withdrawCredential so the reissue path revokes without the
unlink save and the mint's own save carries the new pair. Failure semantics hold in every
direction that mattered: a failed revoke writes nothing and retries next save; a failed
mint after a successful revoke clears the dead credential, which is now the only path
that writes the intermediate null, and only after the mint has failed.

The test that pinned the two-save sequence is replaced by one that forbids it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L25ewntwnavMB5G8gAmnQK
EOF
```

---

## Commit 3 — Behavioural tests for the entity hook

### Task 11: `FormDistributionEntityServer` is exercised as a class, over a fake base

**Files:**
- Create: `packages/CoreEntitiesServer/src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts`
- Modify: `packages/CoreEntitiesServer/src/magic-link/__tests__/FormDistributionEntityServer.spec.ts` (header and six titles)

**Interfaces:**
- Consumes: `MagicLinkMinterRegistry.Instance.Register(minter)` / `.ClearForTests()` from `../minter.js`; `IAnonymousMagicLinkMinter`.

- [ ] **Step 1: Prove the survivors are green first** — apply mutation A by hand and run the existing spec:

```bash
cd packages/CoreEntitiesServer && cp src/magic-link/FormDistributionEntityServer.ts /tmp/fdes.bak
python3 - <<'PY'
p='src/magic-link/FormDistributionEntityServer.ts'; s=open(p).read()
s=s.replace("  private refuseClientCredentialWrites(): void {\n    if (this.credentialWriteInFlight) {","  private refuseClientCredentialWrites(): void {\n    if (true) { return; }\n    if (this.credentialWriteInFlight) {",1); open(p,'w').write(s)
PY
npx vitest run 2>&1 | grep -E "Tests "; cp /tmp/fdes.bak src/magic-link/FormDistributionEntityServer.ts; git diff --stat -- src/magic-link/FormDistributionEntityServer.ts
```

Expected: `Tests  65 passed` with the guard deleted, and an empty diff after restore. (This is the evidence the new spec exists to change.)

- [ ] **Step 2: Write the behavioural spec**

```ts
/**
 * BEHAVIOURAL tests for the credential lifecycle hook — the class runs, over a fake base.
 *
 * The sibling `FormDistributionEntityServer.spec.ts` reads the source. A round-four review ran
 * mutation testing against that file and found the guards it exists for can be deleted outright
 * with the suite green: `refuseClientCredentialWrites` as a total no-op, the delete/revoke
 * order reversed, the re-entrancy check removed. Source-text assertions test presence and
 * position; they cannot test a condition or a sequence. These can.
 *
 * The technique is the one `MagicLinkInviteMinter.spec.ts` already uses: mock the modules that
 * need MJ metadata, and let the real subclass run over a controllable base. `@RegisterClass`
 * becomes a no-op decorator; the generated `mjBizAppsFormsFormDistributionEntity` becomes a
 * class with plain fields, a recorded `Save`/`Delete`, and a `GetFieldByName` the test drives.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
  IAnonymousMagicLinkMinter,
  InviteWriteResult,
  MintAnonymousInviteResult,
} from '../minter.js';

/** One recorded save: the credential pair as it stood when `super.Save()` ran. */
interface RecordedSave {
  MagicLinkInviteID: string | null;
  PublicLinkToken: string | null;
}

/** A dirty-tracking field as `BaseEntity.GetFieldByName` returns it. */
interface FakeField {
  Dirty: boolean;
  OldValue: string | null;
  Value: string | null;
}

/** What every test drives on the fake base. Declared once so the mock and the tests agree. */
interface FakeBaseShape {
  ID: string;
  ChannelType: 'Email' | 'Embed' | 'PublicLink' | 'QR';
  Status: 'Draft' | 'Active' | 'Paused' | 'Closed';
  IsActive: boolean;
  MagicLinkInviteID: string | null;
  PublicLinkToken: string | null;
  CloseAt: Date | null;
  IsSaved: boolean;
  ContextCurrentUser: UserInfo | undefined;
  LatestResult: { CompleteMessage: string } | null;
  fields: Map<string, FakeField>;
  saves: RecordedSave[];
  events: string[];
  saveResult: boolean;
  deleteResult: boolean;
}

vi.mock('@memberjunction/global', async () => {
  // Only the decorator is neutralised. BaseSingleton stays real so MagicLinkMinterRegistry — which
  // the hook reads and these tests register a fake into — is the same instance on both sides.
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, BaseEntity: class {}, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@mj-biz-apps/forms-entities', () => {
  class FakeDistributionBase implements FakeBaseShape {
    ID = 'dist-1';
    ChannelType: FakeBaseShape['ChannelType'] = 'PublicLink';
    Status: FakeBaseShape['Status'] = 'Active';
    IsActive = true;
    MagicLinkInviteID: string | null = null;
    PublicLinkToken: string | null = null;
    CloseAt: Date | null = null;
    IsSaved = true;
    ContextCurrentUser: UserInfo | undefined = { ID: 'staff-1', Name: 'Staff' } as unknown as UserInfo;
    LatestResult: { CompleteMessage: string } | null = null;
    fields = new Map<string, FakeField>();
    saves: RecordedSave[] = [];
    events: string[] = [];
    saveResult = true;
    deleteResult = true;
    GetFieldByName(name: string): FakeField | undefined {
      return this.fields.get(name);
    }
    async Save(): Promise<boolean> {
      this.events.push('save');
      this.saves.push({ MagicLinkInviteID: this.MagicLinkInviteID, PublicLinkToken: this.PublicLinkToken });
      return this.saveResult;
    }
    async Delete(): Promise<boolean> {
      this.events.push('delete');
      return this.deleteResult;
    }
  }
  return { mjBizAppsFormsFormDistributionEntity: FakeDistributionBase };
});

const { FormDistributionEntityServer } = await import('../FormDistributionEntityServer.js');
const { MagicLinkMinterRegistry } = await import('../minter.js');

/** The subclass under test, seen through the fake base's controls. */
type Subject = InstanceType<typeof FormDistributionEntityServer> & FakeBaseShape;

function subject(): Subject {
  return new FormDistributionEntityServer() as unknown as Subject;
}

/** A minter that records the order it is called in on the same `events` log as the base. */
function minterLoggingTo(events: string[], revoke: InviteWriteResult = { success: true, changed: true }): IAnonymousMagicLinkMinter {
  const mint: MintAnonymousInviteResult = { success: true, inviteId: 'invite-new', rawToken: 'mj_ml_new' };
  return {
    MintAnonymousInvite: async () => {
      events.push('mint');
      return mint;
    },
    RevokeAnonymousInvite: async () => {
      events.push('revoke');
      return revoke;
    },
    SetAnonymousInviteExpiry: async () => ({ success: true, changed: false }),
  };
}

beforeEach(() => {
  delete process.env.FORMS_MAGICLINK_CHANNELS;
});
afterEach(() => {
  MagicLinkMinterRegistry.Instance.ClearForTests();
});

/** A live link already holding a working credential, so the decision is `current` and no write follows. */
function withLiveCredential(s: Subject): Subject {
  s.MagicLinkInviteID = 'invite-live';
  s.PublicLinkToken = 'mj_ml_live';
  return s;
}

describe('the credential columns are server-owned (behaviour, not source text)', () => {
  it('restores a client-written MagicLinkInviteID to its old value before the row is saved', async () => {
    const s = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    s.fields.set('MagicLinkInviteID', { Dirty: true, OldValue: 'invite-live', Value: 'invite-evil' });
    s.MagicLinkInviteID = 'invite-evil';

    expect(await s.Save()).toBe(true);
    expect(s.saves[0]).toEqual({ MagicLinkInviteID: 'invite-live', PublicLinkToken: 'mj_ml_live' });
  });

  it('restores a client-SET PublicLinkToken, but keeps a client-CLEARED one — clearing is the reissue request', async () => {
    const set = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(set.events));
    set.fields.set('PublicLinkToken', { Dirty: true, OldValue: 'mj_ml_live', Value: 'mj_ml_forged' });
    set.PublicLinkToken = 'mj_ml_forged';
    await set.Save();
    expect(set.saves[0].PublicLinkToken).toBe('mj_ml_live');

    const cleared = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(cleared.events));
    cleared.fields.set('PublicLinkToken', { Dirty: true, OldValue: 'mj_ml_live', Value: null });
    cleared.PublicLinkToken = null;
    await cleared.Save();
    expect(cleared.saves[0].PublicLinkToken).toBeNull();
  });

  it('strips a credential supplied on CREATE — a new row starts with none and is then issued its own', async () => {
    const s = subject();
    s.IsSaved = false;
    s.MagicLinkInviteID = 'invite-smuggled';
    s.PublicLinkToken = 'mj_ml_smuggled';
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));

    await s.Save();
    expect(s.saves[0]).toEqual({ MagicLinkInviteID: null, PublicLinkToken: null });
  });
});

describe('re-entrancy is bounded (behaviour)', () => {
  it('a throw from provisioning leaves the in-flight guard false, so the next save is not skipped', async () => {
    const s = subject();
    MagicLinkMinterRegistry.Instance.Register({
      ...minterLoggingTo(s.events),
      MintAnonymousInvite: async () => {
        throw new Error('boom');
      },
    });
    expect(await s.Save()).toBe(true);
    // A second save must reach provisioning again; with the guard wedged it would return early
    // after super.Save and never call the minter.
    s.events.length = 0;
    await s.Save();
    expect(s.events).toContain('mint');
  });
});

describe('deleting a distribution (behaviour)', () => {
  it('deletes FIRST and revokes only after the delete succeeded', async () => {
    const s = withLiveCredential(subject());
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    expect(await s.Delete()).toBe(true);
    expect(s.events).toEqual(['delete', 'revoke']);
  });

  it('does not revoke when the delete was refused — a bounced delete must not kill a live credential', async () => {
    const s = withLiveCredential(subject());
    s.deleteResult = false;
    MagicLinkMinterRegistry.Instance.Register(minterLoggingTo(s.events));
    expect(await s.Delete()).toBe(false);
    expect(s.events).toEqual(['delete']);
  });
});
```

- [ ] **Step 3: Run it** — `cd packages/CoreEntitiesServer && npx vitest run src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts`. Expected: PASS on the unmutated source.

- [ ] **Step 4: Prove it bites** — re-apply mutation A from Step 1 and run the behavioural spec. Expected: at least `restores a client-written MagicLinkInviteID` **FAILS**. Restore. Then apply the delete-order inversion and confirm `deletes FIRST` **FAILS**. Restore; `git diff --stat` on the source must be empty.

- [ ] **Step 5: Retitle the source-text spec** — in `FormDistributionEntityServer.spec.ts`:
  - Header: replace the paragraph beginning `They match on the call and the ordering rather than on formatting` with: `These assert PRESENCE and TEXTUAL POSITION — that a call exists, that one string precedes another. They cannot assert a condition or a sequence: mutation testing showed the client-write guard deleted outright, and the delete/revoke order reversed, with every case here green. The behaviour is tested in FormDistributionEntityServer.behaviour.spec.ts; what remains here is a cheap structural smoke that a refactor did not remove a call entirely.`
  - `'keeps the in-flight guard, and checks it before provisioning'` → `'mentions the in-flight guard in Save, and resets it in a finally'`
  - `'resets the guard in a finally, so a throw cannot wedge the record permanently'` → delete this case (strictly weaker than the one above; the behaviour spec covers the wedge).
  - `'deletes FIRST and revokes after, so a refused delete cannot kill a live credential'` → `'mentions super.Delete before RevokeAnonymousInvite in the source (order of CALLS is tested behaviourally)'`
  - `'returns false without revoking when the delete itself was refused'` → keep the assertion, retitle `'has an early return on a refused super.Delete'`.
  - `'refuses client writes BEFORE the record is persisted, not after'` → `'places refuseClientCredentialWrites textually before super.Save'`.
  - Delete the sentence `each guards a decision whose failure mode is silence` from the header.

- [ ] **Step 6: Run both specs green, commit**

```bash
cd packages/CoreEntitiesServer && npx vitest run && cd ../.. && git add packages/CoreEntitiesServer/src/magic-link/__tests__/
git commit -F - <<'EOF'
test(magic-link): the hook's guards are tested as behaviour, not as source text

Mutation testing showed refuseClientCredentialWrites could be deleted outright — or
inverted to permit arbitrary token writes — and the delete/revoke order reversed, with
the existing spec fully green. That spec asserts presence and textual position; a
condition or a sequence is invisible to it.

The new spec instantiates the real subclass over a fake generated base, the technique
MagicLinkInviteMinter.spec.ts already uses, and asserts what the guards DO: a client
write of the invite id is restored before the row is saved; a set token is restored and a
cleared one kept; a credential supplied on create is stripped; Delete runs before the
revoke and skips it when refused; a throw does not wedge the re-entrancy guard. Each
was watched fail under the mutation it exists to catch.

The source-text spec's titles are cut back to what its assertions establish.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L25ewntwnavMB5G8gAmnQK
EOF
```

---

## Commit 4 — Behavioural tests for the Distribute tab, and the error-clobber fix

### Task 12: `DistributionService` is driven with a fake entity

**Files:**
- Create: `packages/Angular/src/lib/builder/distribution.service.behaviour.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
/**
 * `DistributionService` exercised as a class. It has no constructor injection, so under the
 * `@angular/compiler` side-effect import the repo already uses it constructs in this node env —
 * which the sibling source-text spec claimed it could not. The entity is a recording fake: the
 * methods under test touch only the record they are handed and `Save(options)`.
 */
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import type { EntitySaveOptions } from '@memberjunction/core';
import type { mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';
import { DistributionService } from './distribution.service';

interface FakeDistribution {
  ID: string;
  Status: string;
  IsActive: boolean;
  PublicLinkToken: string | null;
  MagicLinkInviteID: string | null;
  MaxResponses: number | null;
  LatestResult: { CompleteMessage: string } | null;
  writes: Record<string, unknown>;
  savedWith: EntitySaveOptions | undefined;
  reverted: boolean;
  Save(options?: EntitySaveOptions): Promise<boolean>;
  Revert(): boolean;
}

function fakeDistribution(overrides: Partial<FakeDistribution> = {}): FakeDistribution {
  const target: FakeDistribution = {
    ID: 'dist-1',
    Status: 'Draft',
    IsActive: false,
    PublicLinkToken: 'mj_ml_old',
    MagicLinkInviteID: 'invite-old',
    MaxResponses: null,
    LatestResult: null,
    writes: {},
    savedWith: undefined,
    reverted: false,
    async Save(options) {
      target.savedWith = options;
      return true;
    },
    Revert() {
      target.reverted = true;
      return true;
    },
    ...overrides,
  };
  return new Proxy(target, {
    set(t, prop: string, value) {
      if (prop !== 'writes' && prop !== 'savedWith' && prop !== 'reverted') t.writes[prop] = value;
      Reflect.set(t, prop, value);
      return true;
    },
  });
}

const asEntity = (d: FakeDistribution): mjBizAppsFormsFormDistributionEntity =>
  d as unknown as mjBizAppsFormsFormDistributionEntity;

describe('DistributionService — opening a link', () => {
  it('writes BOTH halves of "open to responses", and forces the save', async () => {
    // Writing only Status left a row at Status='Active', IsActive=false unchanged, Save() skipped
    // the clean record, and the control reported success having done nothing — permanently.
    const d = fakeDistribution({ Status: 'Active', IsActive: false });
    const out = await new DistributionService().open(asEntity(d));
    expect(out.ok).toBe(true);
    expect(d.writes).toMatchObject({ Status: 'Active', IsActive: true });
    expect(d.savedWith?.IgnoreDirtyState).toBe(true);
  });

  it('issueLink is the same operation as open', async () => {
    const d = fakeDistribution();
    await new DistributionService().issueLink(asEntity(d));
    expect(d.writes).toMatchObject({ Status: 'Active', IsActive: true });
    expect(d.savedWith?.IgnoreDirtyState).toBe(true);
  });
});

describe('DistributionService — reissuing', () => {
  it('clears ONLY the token; the invite id is what tells the server which credential to revoke', async () => {
    const d = fakeDistribution({ Status: 'Active', IsActive: true });
    await new DistributionService().reissueLink(asEntity(d));
    expect(d.writes).toEqual({ PublicLinkToken: null });
    expect(d.MagicLinkInviteID).toBe('invite-old');
  });
});

describe('DistributionService — a refused save', () => {
  it('reverts the record so the screen stops showing the value the database bounced', async () => {
    const d = fakeDistribution({
      Save: async () => false,
      LatestResult: { CompleteMessage: 'too big' },
    });
    const out = await new DistributionService().setMaxResponses(asEntity(d), 99_999_999);
    expect(out).toEqual({ ok: false, error: expect.stringContaining('too big') });
    expect(d.reverted).toBe(true);
  });
});
```

- [ ] **Step 2: Run it** — `cd packages/Angular && npx vitest run src/lib/builder/distribution.service.behaviour.spec.ts` → PASS on the unmutated service.

- [ ] **Step 3: Prove it bites** — remove `dist.IsActive = true;` from `openForResponses`, run → `writes BOTH halves` FAILS. Restore. Change `reissueLink` to also `dist.MagicLinkInviteID = null;` → `clears ONLY the token` FAILS. Restore; `git diff --stat` on the service must be empty.

### Task 13: The component is constructed in an injection context; the error clobber is fixed (#4)

**Files:**
- Create: `packages/Angular/src/lib/builder/distribution-manager.behaviour.spec.ts`
- Modify: `packages/Angular/src/lib/builder/distribution-manager.component.ts` (`warnIfStillUnissued`, `warnIfStillRedeemable`)

- [ ] **Step 1: Write the spec, including the RED case for #4**

```ts
/**
 * `DistributionManagerComponent` exercised as a class.
 *
 * It uses field `inject()`, which needs an injection context — not a TestBed. Angular's own
 * `runInInjectionContext` over an `Injector.create(...)` of stub providers is enough, and was
 * verified by spike in this node environment. Every provider is a narrow fake: the service
 * records calls and returns what the test says; the sanitizer passes strings through; the
 * change detector is inert.
 */
import '@angular/compiler';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { describe, it, expect } from 'vitest';
import type { mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';
import { DistributionManagerComponent } from './distribution-manager.component';
import { DistributionService, type MutationOutcome } from './distribution.service';

/** The part of a link the component reads. */
interface LinkShape {
  ID: string;
  Name: string;
  Slug: string;
  Status: 'Draft' | 'Active' | 'Paused' | 'Closed';
  IsActive: boolean;
  PublicLinkToken: string | null;
  MagicLinkInviteID: string | null;
  OpenAt: Date | null;
  CloseAt: Date | null;
  MaxResponses: number | null;
  ResponseCount: number;
}

function link(overrides: Partial<LinkShape> = {}): mjBizAppsFormsFormDistributionEntity {
  const base: LinkShape = {
    ID: 'dist-1', Name: 'Summer survey', Slug: 'summer-survey', Status: 'Active', IsActive: true,
    PublicLinkToken: 'mj_ml_live', MagicLinkInviteID: 'invite-live', OpenAt: null, CloseAt: null,
    MaxResponses: null, ResponseCount: 0, ...overrides,
  };
  return base as unknown as mjBizAppsFormsFormDistributionEntity;
}

/** A service double that records which method ran and serves a scripted sequence of list() results. */
interface ServiceDouble {
  calls: string[];
  listResults: mjBizAppsFormsFormDistributionEntity[][];
  outcome: MutationOutcome;
  service: Pick<DistributionService, 'list' | 'open' | 'close' | 'issueLink' | 'reissueLink' | 'setSchedule' | 'setMaxResponses'>;
}

function serviceDouble(initial: mjBizAppsFormsFormDistributionEntity[], outcome: MutationOutcome = { ok: true }): ServiceDouble {
  const calls: string[] = [];
  const listResults: mjBizAppsFormsFormDistributionEntity[][] = [initial];
  const record = (name: string) => async () => {
    calls.push(name);
    return outcome;
  };
  return {
    calls, listResults, outcome,
    service: {
      list: async () => {
        calls.push('list');
        return { ok: true, items: listResults[Math.min(calls.filter((c) => c === 'list').length - 1, listResults.length - 1)] };
      },
      open: record('open'), close: record('close'), issueLink: record('issueLink'),
      reissueLink: record('reissueLink'), setSchedule: record('setSchedule'), setMaxResponses: record('setMaxResponses'),
    },
  };
}

/** The protected surface a test drives. Kept to the members these tests touch. */
interface Driver {
  links: mjBizAppsFormsFormDistributionEntity[];
  selectedId: string | null;
  busy: boolean;
  actionError: string | null;
  applyFix(): Promise<void>;
  toggleOpen(): Promise<void>;
}

function construct(double: ServiceDouble): Driver {
  const injector = Injector.create({
    providers: [
      { provide: DistributionService, useValue: double.service },
      { provide: DomSanitizer, useValue: { bypassSecurityTrustUrl: (v: string) => v, bypassSecurityTrustHtml: (v: string) => v } },
      { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
    ],
  });
  const c = runInInjectionContext(injector, () => new DistributionManagerComponent());
  const d = c as unknown as Driver;
  d.links = double.listResults[0];
  d.selectedId = d.links[0]?.ID ?? null;
  return d;
}

describe('DistributionManagerComponent — the fix button', () => {
  it("'paused' calls open, and re-reads the record afterwards", async () => {
    const double = serviceDouble([link({ Status: 'Closed', IsActive: false, PublicLinkToken: null, MagicLinkInviteID: null })]);
    const d = construct(double);
    await d.applyFix();
    expect(double.calls).toEqual(['open', 'list']);
  });

  it("'pending' calls issueLink, and re-reads the record afterwards", async () => {
    const double = serviceDouble([link({ PublicLinkToken: null, MagicLinkInviteID: null })]);
    const d = construct(double);
    await d.applyFix();
    expect(double.calls).toEqual(['issueLink', 'list']);
  });
});

describe('DistributionManagerComponent — a real save error is not overwritten with a diagnosis (#114 review, finding 4)', () => {
  it('keeps the save error when issuing fails, instead of claiming magic links are switched off', async () => {
    // The save was refused — a slug conflict, say. The re-read still shows no token, and the
    // "still unissued" warning used to replace the real reason with "Public links are not
    // switched on for this server", sending the author to audit config that is correct.
    const unissued = link({ PublicLinkToken: null, MagicLinkInviteID: null });
    const double = serviceDouble([unissued], { ok: false, error: 'Could not issue a link. Slug already in use.' });
    const d = construct(double);
    await d.applyFix();
    expect(d.actionError).toBe('Could not issue a link. Slug already in use.');
    expect(d.actionError).not.toMatch(/not switched on/);
  });

  it('keeps the save error when closing fails, instead of claiming the withdrawal is unconfirmed', async () => {
    // Reachable only when the re-read disagrees with the refused save — another tab paused the
    // link between the two round-trips, so the reload shows paused-with-token while actionError
    // holds the real refusal. Rare, but the guard is the same one, and it must not be the one
    // helper left able to overwrite a real error.
    const live = link();
    const double = serviceDouble([live], { ok: false, error: 'Could not pause this share link. Row locked.' });
    double.listResults.push([link({ Status: 'Closed', IsActive: false, PublicLinkToken: 'mj_ml_live' })]);
    const d = construct(double);
    await d.toggleOpen();
    expect(d.actionError).toBe('Could not pause this share link. Row locked.');
  });

  it('still warns when the save SUCCEEDED but the token did not arrive', async () => {
    // The guard must not become silence: with no save error, the diagnosis is still owed.
    const unissued = link({ PublicLinkToken: null, MagicLinkInviteID: null });
    const double = serviceDouble([unissued]);
    const d = construct(double);
    await d.applyFix();
    expect(d.actionError).toMatch(/not switched on/);
  });
});
```

- [ ] **Step 2: Run red** — `cd packages/Angular && npx vitest run src/lib/builder/distribution-manager.behaviour.spec.ts`. Expected: the two `keeps the save error` cases FAIL (actionError holds the diagnosis); the others PASS.

- [ ] **Step 3: Fix #4** — in `distribution-manager.component.ts`, at the top of both `warnIfStillUnissued` and `warnIfStillRedeemable`, before the `links.find`:

```ts
    if (this.actionError !== null) {
      // The write itself failed and `run()` recorded why. A diagnosis about the token would
      // OVERWRITE that reason with a guess — "magic links are not switched on" over a slug
      // conflict — and send the author to audit config that is correct. The real error wins.
      return;
    }
```

- [ ] **Step 4: Run green** → all cases PASS.

- [ ] **Step 5: Prove the survivors bite** — empty the `case 'paused':` body in `applyFix` (leave `return;`) → `'paused' calls open` FAILS. Restore. Change `runCredentialWrite` to skip `reload` → both `re-reads` cases FAIL. Restore; `git diff --stat` on the component shows only the #4 change.

### Task 14: The source-text component spec stops claiming what it cannot show

**Files:** `packages/Angular/src/lib/builder/distribution-manager.spec.ts`

- [ ] **Step 1: Edit**
  - Header: replace `it cannot be instantiated in the vitest node env (no Angular JIT)` with `it can be instantiated — see distribution-manager.behaviour.spec.ts, which uses runInInjectionContext — but these predate that and guard template text, which no class test reaches`. Replace `They match loosely … so a reflow cannot red them.` with `They assert presence, not behaviour; mutation testing showed five decisions here survive with this file green, and each of those five is now tested behaviourally in the two *.behaviour.spec.ts siblings.`
  - `'offers all three ways to share, for every link'` → `'offers all three ways to share'`.
  - `'handles every state kind in the fix switch'` → `'names every state kind in the fix switch (what each branch DOES is tested behaviourally)'`; delete the comment line `A missing branch is a button that renders and then does nothing when pressed.`
  - `'forces the save when asking the server to issue a link'` → `'mentions IgnoreDirtyState in the service (whether it is PASSED is tested behaviourally)'`.
  - `'puts the record back when a save is refused'`: delete the comment `Cannot be reached from the node env (the service constructs a Metadata provider at field-initialiser time)` — it is false — and retitle `'mentions Revert in the service (tested behaviourally in distribution.service.behaviour.spec.ts)'`.
  - `'re-reads the record QUIETLY after a credential write, so the pane is not unmounted'` → `'passes quiet=true to the reload (that a reload HAPPENS is tested behaviourally)'`.

- [ ] **Step 2: Run the whole Angular package** — `cd packages/Angular && npx vitest run` → PASS.

- [ ] **Step 3: Commit**

```bash
cd <root> && git add packages/Angular/src/lib/builder/distribution.service.behaviour.spec.ts packages/Angular/src/lib/builder/distribution-manager.behaviour.spec.ts packages/Angular/src/lib/builder/distribution-manager.component.ts packages/Angular/src/lib/builder/distribution-manager.spec.ts
git commit -F - <<'EOF'
fix(builder): a save error is no longer replaced by a diagnosis; the tab is tested as behaviour

runCredentialWrite recorded the real reason a save was refused, and the two "still
unissued / still redeemable" helpers then overwrote it unconditionally. A slug conflict
on "Issue the link" read as "Public links are not switched on for this server" — the
confidently-wrong surface share-state.ts exists to prevent, one layer up. Both helpers
now yield to an existing error.

The service and the component gain behavioural specs. The service constructs bare under
the @angular/compiler side-effect import — the source-text spec's claim that it could not
was false — and the component constructs inside runInInjectionContext over stub
providers, no TestBed. Between them they pin the five decisions mutation testing showed
the source-text spec could not see: both halves of "open", the forced save, the reissue
clearing only the token, the reload after a credential write, and the paused fix branch.
Each was watched fail under its mutation. The source-text spec's titles are cut back to
what they establish.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L25ewntwnavMB5G8gAmnQK
EOF
```

---

## Commit 5 — The guard-mutation gate

### Task 15: `scripts/check-guard-mutants.mjs` proves each declared guard has a test that dies with it

**Files:**
- Create: `scripts/check-guard-mutants.mjs`
- Create: `scripts/check-guard-mutants.spec.mjs`
- Modify: `package.json` (scripts)
- Modify: `.github/workflows/build.yml` (one step)

**Interfaces:**
- Produces: `npm run lint:guard-mutants` — exit 0 iff every manifest entry is KILLED. Exported `runMutant(entry, opts)` for its own spec.

- [ ] **Step 1: Write the harness**

```js
#!/usr/bin/env node
/**
 * Guard-mutation gate for PRODUCT code — does a test actually die when a load-bearing guard is
 * neutralised?
 *
 * `check-distribution-seed.mutants.mjs` asks this of a gate SCRIPT and has for months; nobody had
 * asked it of the code the repo ships. Asked, the answer was seventeen survivors, every one in a
 * source-text spec: the client-write refusal on the credential columns deleted outright, the
 * delete/revoke order reversed, both halves of "open" dropped — suite green throughout. This
 * generalises the same instrument: apply one textual mutation to one source file, run that
 * package's vitest suite, restore, and require the run to have FAILED. A mutant that stays green
 * fails the gate and names the guard.
 *
 * MANIFEST discipline, inherited from the sibling harness:
 *   - `find` must match the source EXACTLY once. A drifted anchor is NOT APPLIED and fatal —
 *     a silently unapplied mutant reads exactly like a healthy one.
 *   - The package suite must pass unmutated first (BASELINE). A suite that is red for another
 *     reason would report every mutant as killed and measure nothing.
 *   - A run that produces no vitest summary is CRASHED, not killed.
 *
 * Cost: one package suite per mutant. CoreEntitiesServer's is ~0.3s, Angular's a few seconds.
 * Serial on purpose — a dozen mutants is under a minute and a worker pool is more harness to own.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUITE_TIMEOUT_MS = 180_000;

/**
 * Every entry is a guard the codebase calls load-bearing, expressed as the smallest edit that
 * removes it. `behaviour` says what the reader loses, because that is what a SURVIVED message
 * has to tell someone who has never read the source.
 */
export const MUTANTS = [
  // --- FormDistributionEntityServer: the credential columns are server-owned -----------------
  {
    name: 'hook/client-write-guard-neutralised',
    behaviour: 'a client write of MagicLinkInviteID / PublicLinkToken is refused before super.Save()',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '  private refuseClientCredentialWrites(): void {\n    if (this.credentialWriteInFlight) {',
    replace: '  private refuseClientCredentialWrites(): void {\n    if (true) { return; }\n    if (this.credentialWriteInFlight) {',
    suite: 'packages/CoreEntitiesServer',
  },
  {
    name: 'hook/token-rule-inverted',
    behaviour: 'a client may CLEAR PublicLinkToken (the reissue request) but never SET one',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: "    if (token?.Dirty && token.Value !== null && token.Value !== '') {",
    replace: "    if (token?.Dirty && (token.Value === null || token.Value === '')) {",
    suite: 'packages/CoreEntitiesServer',
  },
  {
    name: 'hook/invite-id-restored-from-old-value',
    behaviour: 'a dirty MagicLinkInviteID is restored to its OLD value, not trusted',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '    if (invite?.Dirty) {',
    replace: '    if (invite?.Dirty && !invite.OldValue) {',
    suite: 'packages/CoreEntitiesServer',
  },
  {
    name: 'hook/create-strip',
    behaviour: 'a credential supplied on CREATE is stripped',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '      if (this.MagicLinkInviteID || this.PublicLinkToken) {',
    replace: '      if (false) {',
    suite: 'packages/CoreEntitiesServer',
  },
  {
    name: 'hook/reentrancy-guard-finally',
    behaviour: 'the in-flight guard is reset in a finally, so a throw cannot wedge the record',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '    } finally {\n      this.credentialWriteInFlight = false;\n    }',
    replace: '    } finally {\n      /* wedged */\n    }',
    suite: 'packages/CoreEntitiesServer',
  },
  {
    name: 'hook/delete-before-revoke',
    behaviour: 'Delete() runs super.Delete FIRST and revokes only after it succeeds',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    // A real, compiling reorder: revoke first, then delete. The behavioural spec's events log then
    // reads ['revoke', 'delete', 'revoke'], which toEqual(['delete', 'revoke']) rejects. (A replace
    // that fails to COMPILE would read as KILLED for the wrong reason — vitest reports a compile
    // error as a failed file.)
    find: '    if (!(await super.Delete(options))) {\n      return false;\n    }\n    if (!inviteId) {\n      return true;\n    }\n\n    const minter = MagicLinkMinterRegistry.Instance.Minter;',
    replace: '    const minter = MagicLinkMinterRegistry.Instance.Minter;\n    if (inviteId && minter && contextUser) {\n      await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser);\n    }\n    if (!(await super.Delete(options))) {\n      return false;\n    }\n    if (!inviteId) {\n      return true;\n    }',
    suite: 'packages/CoreEntitiesServer',
  },
  // --- provision-runner: the reissue is one save ----------------------------------------------
  {
    name: 'runner/reissue-single-save',
    behaviour: 'a reissue writes the new pair in ONE save, never an intermediate (null, null)',
    file: 'packages/CoreEntitiesServer/src/magic-link/provision-runner.ts',
    find: '    const revoked = await revokeInvite(ctx, minter, contextUser);\n    if (revoked !== \'revoked\') {\n      return { result: revoked, inviteId: ctx.magicLinkInviteId ?? undefined };\n    }\n    return issueCredential(',
    replace: '    const revoked = await revokeInvite(ctx, minter, contextUser);\n    if (revoked !== \'revoked\') {\n      return { result: revoked, inviteId: ctx.magicLinkInviteId ?? undefined };\n    }\n    await persistCredential(null);\n    return issueCredential(',
    suite: 'packages/CoreEntitiesServer',
  },
  // --- distribution.service: "open" is both halves, and forced -------------------------------
  {
    name: 'service/open-drops-isactive',
    behaviour: 'openForResponses writes IsActive = true as well as Status',
    file: 'packages/Angular/src/lib/builder/distribution.service.ts',
    find: "    dist.Status = 'Active';\n    dist.IsActive = true;",
    replace: "    dist.Status = 'Active';",
    suite: 'packages/Angular',
  },
  {
    name: 'service/open-not-forced',
    behaviour: 'openForResponses passes IgnoreDirtyState so a clean record still reaches the hook',
    file: 'packages/Angular/src/lib/builder/distribution.service.ts',
    find: '    options.IgnoreDirtyState = true;\n    return this.saveDist(dist, action, options);',
    replace: '    return this.saveDist(dist, action);',
    suite: 'packages/Angular',
  },
  {
    name: 'service/reissue-clears-invite-id',
    behaviour: 'reissueLink clears ONLY the token; clearing the invite id orphans the old invite',
    file: 'packages/Angular/src/lib/builder/distribution.service.ts',
    find: '    dist.PublicLinkToken = null;\n    return this.saveDist(dist, \'reissue this link\');',
    replace: "    dist.PublicLinkToken = null;\n    dist['MagicLinkInviteID'] = null;\n    return this.saveDist(dist, 'reissue this link');",
    suite: 'packages/Angular',
  },
  // --- distribution-manager: the credential writes reload, and the fix button does something --
  {
    name: 'component/credential-write-no-reload',
    behaviour: 'runCredentialWrite re-reads the record after the write',
    file: 'packages/Angular/src/lib/builder/distribution-manager.component.ts',
    find: '    await this.run(write);\n    await this.reload(true);',
    replace: '    await this.run(write);',
    suite: 'packages/Angular',
  },
  {
    name: 'component/paused-fix-noop',
    behaviour: "applyFix's 'paused' branch actually reopens the link",
    file: 'packages/Angular/src/lib/builder/distribution-manager.component.ts',
    find: "      case 'paused':\n        // Warns for the same reason `pending` does: reopening asks the server to mint, and the\n        // hook is fail-soft, so \"turned it back on and got no web address\" is a real outcome the\n        // author would otherwise have to notice from the badge alone.\n        await this.runCredentialWrite(() => this.service.open(link));\n        this.warnIfStillUnissued(link.ID, 'issue');\n        return;",
    replace: "      case 'paused':\n        return;",
    suite: 'packages/Angular',
  },
  {
    name: 'component/warn-clobbers-save-error',
    behaviour: 'a real save error is not overwritten by the "still unissued" diagnosis',
    file: 'packages/Angular/src/lib/builder/distribution-manager.component.ts',
    find: '  private warnIfStillUnissued(linkId: string, wrote: \'issue\' | \'reissue\'): void {\n    if (this.actionError !== null) {',
    replace: '  private warnIfStillUnissued(linkId: string, wrote: \'issue\' | \'reissue\'): void {\n    if (false) {',
    suite: 'packages/Angular',
  },
];

/** Apply `entry` to its file, run its suite, restore. Returns one of the four verdicts. */
export function runMutant(entry, { repoRoot = REPO_ROOT, run = runSuite } = {}) {
  const path = join(repoRoot, entry.file);
  const original = readFileSync(path, 'utf-8');
  const occurrences = original.split(entry.find).length - 1;
  if (occurrences !== 1) {
    return { verdict: 'NOT APPLIED', detail: `find matched ${occurrences} times` };
  }
  writeFileSync(path, original.replace(entry.find, entry.replace));
  try {
    const result = run(join(repoRoot, entry.suite));
    if (result.crashed) return { verdict: 'CRASHED', detail: result.detail };
    return result.failed > 0
      ? { verdict: 'KILLED', detail: `${result.failed} failing` }
      : { verdict: 'SURVIVED', detail: `${result.passed} passing, 0 failing` };
  } finally {
    writeFileSync(path, original);
  }
}

/** Run a package's vitest suite and read its summary line. Absence of a summary is a crash. */
function runSuite(cwd) {
  const res = spawnSync('npx', ['vitest', 'run', '--reporter=default'], {
    cwd, encoding: 'utf-8', timeout: SUITE_TIMEOUT_MS, env: { ...process.env, CI: '1' },
  });
  const out = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
  const summary = out.match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed/);
  if (!summary) return { crashed: true, detail: res.error?.message ?? out.slice(-400) };
  return { crashed: false, failed: Number(summary[1] ?? 0), passed: Number(summary[2]) };
}

function main() {
  const suites = [...new Set(MUTANTS.map((m) => m.suite))];
  for (const suite of suites) {
    const baseline = runSuite(join(REPO_ROOT, suite));
    if (baseline.crashed || baseline.failed > 0) {
      console.error(`BASELINE FAILED for ${suite}: ${baseline.detail ?? `${baseline.failed} failing`} — nothing measured.`);
      process.exit(2);
    }
  }
  let bad = 0;
  for (const entry of MUTANTS) {
    const { verdict, detail } = runMutant(entry);
    const ok = verdict === 'KILLED';
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${entry.name.padEnd(44)} ${verdict.padEnd(12)} ${detail}`);
    if (!ok) console.log(`      lost: ${entry.behaviour}`);
  }
  if (bad > 0) {
    console.error(`\n❌ ${bad} guard(s) can be neutralised with the suite green. Write the behavioural test each entry names.`);
    process.exit(1);
  }
  console.log(`\n✅ Guard-mutation check passed — all ${MUTANTS.length} load-bearing guards are killed by their package suite.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 2: Write the harness's own spec** — `scripts/check-guard-mutants.spec.mjs`, stdlib `node:test`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMutant, MUTANTS } from './check-guard-mutants.mjs';

function tree(source) {
  const root = mkdtempSync(join(tmpdir(), 'guard-mutants-'));
  mkdirSync(join(root, 'pkg', 'src'), { recursive: true });
  writeFileSync(join(root, 'pkg', 'src', 'a.ts'), source);
  return root;
}
const entry = { name: 'x', behaviour: 'y', file: 'pkg/src/a.ts', find: 'if (guard)', replace: 'if (true)', suite: 'pkg' };

test('a suite that fails under the mutation is KILLED, and the source is restored', () => {
  const root = tree('if (guard) { a(); }');
  const r = runMutant(entry, { repoRoot: root, run: () => ({ crashed: false, failed: 1, passed: 9 }) });
  assert.equal(r.verdict, 'KILLED');
  assert.equal(readFileSync(join(root, 'pkg/src/a.ts'), 'utf-8'), 'if (guard) { a(); }');
});

test('a suite that stays green is SURVIVED', () => {
  const r = runMutant(entry, { repoRoot: tree('if (guard) { a(); }'), run: () => ({ crashed: false, failed: 0, passed: 9 }) });
  assert.equal(r.verdict, 'SURVIVED');
});

test('a find that does not match exactly once is NOT APPLIED — never silently skipped', () => {
  assert.equal(runMutant(entry, { repoRoot: tree('nothing here'), run: () => ({ crashed: false, failed: 1, passed: 1 }) }).verdict, 'NOT APPLIED');
  assert.equal(runMutant(entry, { repoRoot: tree('if (guard) if (guard)'), run: () => ({ crashed: false, failed: 1, passed: 1 }) }).verdict, 'NOT APPLIED');
});

test('a run with no summary is CRASHED, not KILLED', () => {
  const r = runMutant(entry, { repoRoot: tree('if (guard) { a(); }'), run: () => ({ crashed: true, detail: 'no summary' }) });
  assert.equal(r.verdict, 'CRASHED');
});

test('the source is restored even when the suite runner throws', () => {
  const root = tree('if (guard) { a(); }');
  assert.throws(() => runMutant(entry, { repoRoot: root, run: () => { throw new Error('boom'); } }));
  assert.equal(readFileSync(join(root, 'pkg/src/a.ts'), 'utf-8'), 'if (guard) { a(); }');
});

test('every manifest entry names a file that exists and a find that matches exactly once', () => {
  for (const m of MUTANTS) {
    const src = readFileSync(join(new URL('..', import.meta.url).pathname, m.file), 'utf-8');
    assert.equal(src.split(m.find).length - 1, 1, `${m.name}: find must match exactly once`);
  }
});
```

- [ ] **Step 3: Run the spec** — `node --test scripts/check-guard-mutants.spec.mjs` → all pass. The last test is the one that catches a drifted anchor at PR time without paying for a suite run.

- [ ] **Step 4: Run the gate** — `node scripts/check-guard-mutants.mjs`. Expected: every entry KILLED. Any SURVIVED here means a behavioural test from Commits 3–4 is not actually constraining that guard — fix the test, not the manifest.

- [ ] **Step 5: Wire it** — `package.json` scripts, beside `lint:distribution:mutants`:

```json
    "lint:guard-mutants": "node scripts/check-guard-mutants.mjs",
    "lint:guard-mutants:test": "node --test scripts/check-guard-mutants.spec.mjs",
```

`.github/workflows/build.yml`, after the `Run tests` step:

```yaml
      # Product-code mutation gate. Seventeen guards this repo's comments call load-bearing could
      # be deleted with the suite green — every one in a source-text spec. This runs each package
      # suite under one neutralising edit per declared guard and fails if any stays green. Runs
      # after `Run tests` because it needs the baseline green, and after the build because the
      # packages import each other's dist.
      - name: Guard-mutation gate
        run: npm run lint:guard-mutants:test && npm run lint:guard-mutants
```

- [ ] **Step 6: Commit**

```bash
git add scripts/check-guard-mutants.mjs scripts/check-guard-mutants.spec.mjs package.json .github/workflows/build.yml
git commit -F - <<'EOF'
test(gates): a mutation gate for product code, so a guard without a real test fails CI

check-distribution-seed.mutants.mjs has asked "does a test die when this behaviour is
removed?" of a gate script for months. Asked of the code the repo ships, the answer was
seventeen survivors, every one in a source-text spec. This is the same instrument
pointed at product code: a manifest of load-bearing guards, each expressed as the
smallest edit that removes it; apply, run the package suite, restore, require red.

Inherits the sibling's discipline — a find that matches other than once is NOT APPLIED
and fatal, a suite that produces no summary is CRASHED not killed, and the baseline must
pass before anything is measured. Its own spec covers those four verdicts and checks
every manifest anchor still matches, which catches a drifted anchor at PR time without
paying for a suite run.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L25ewntwnavMB5G8gAmnQK
EOF
```

---

## Commit 6 — The seventy type errors

### Task 16: Every spec compiles

**Files:** the 21 spec files listed below. No production file changes — a type error in a spec that turns out to be a production defect is reported, not fixed here.

Per-file counts (from `tsc --noEmit` with spec globs un-excluded, at `9386836`):

| Package | File | Errors | Dominant codes |
|---|---|---|---|
| Entities | `src/contracts/flow-resolver.spec.ts` | 2 | TS2536 (indexing a generic `R` with a literal) |
| Entities | `src/contracts/jump-targets.spec.ts` | 1 | TS2345 (`unknown` → `string \| object`) |
| Server | `src/public-submit/__tests__/validation.service.spec.ts` | 12 | TS2739 (fixture missing required fields) |
| Server | `src/public-submit/__tests__/disqualification-gates.spec.ts` | 11 | TS2739 |
| Server | `src/asset/__tests__/asset.service.spec.ts` | 4 | TS2322 (`vi.fn` mock not assignable to provider interface) |
| Server | `src/public-submit/__tests__/rule-verbs-validation.spec.ts` | 2 | |
| Server | `src/public-submit/__tests__/submit-pipeline.spec.ts` | 1 | |
| Server | `src/public-submit/__tests__/score-basis.spec.ts` | 1 | |
| Server | `src/public-submit/__tests__/fakes.ts` | 1 | |
| Angular | `src/lib/dashboard/services/reporting-aggregations.spec.ts` | 8 | |
| Angular | `src/lib/builder/condition-sources.spec.ts` | 7 | TS2532/TS18048 (possibly undefined) |
| Angular | `src/lib/widget/core/form-runtime.spec.ts` | 5 | |
| Angular | `src/lib/widget/widget-providers.spec.ts` | 2 | |
| Angular | `src/lib/templates/template-fingerprint.spec.ts` | 2 | |
| Angular | `src/lib/dashboard/services/export-pivot.spec.ts` | 2 | |
| Angular | `src/lib/builder/rules-inventory.spec.ts` | 2 | |
| Angular | `src/lib/builder/json-fields.spec.ts` | 2 | |
| Angular | `src/lib/widget/core/upload-store.spec.ts` | 1 | |
| Angular | `src/lib/widget/core/turnstile-gate.spec.ts` | 1 | |
| Angular | `src/lib/widget/core/shown-screen.spec.ts` | 1 | |
| Angular | `src/lib/widget/core/doodle-persistence.spec.ts` | 1 | |
| Angular | `src/lib/builder/screen-strip.spec.ts` | 1 | |

- [ ] **Step 1: Get the live list** — for each of `Entities Server Angular`:

```bash
cd packages/<Pkg> && printf '{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": true }, "exclude": ["node_modules", "dist"] }' > tsconfig.typecheck.json && npx tsc -p tsconfig.typecheck.json 2>&1 | grep "error TS"
```

(Leave `tsconfig.typecheck.json` in place — Task 17 makes it permanent.)

- [ ] **Step 2: Fix by code, with these rules**
  - **TS2739 / TS2741 (object missing properties)**: the fixture is a partial of an entity type. Add the missing required fields to the fixture factory with realistic values. Do NOT widen the production type and do NOT cast the fixture.
  - **TS2322 (mock not assignable to interface)**: type the mock object as `Pick<Interface, 'MethodUsed'>` where the interface is consumed, or build it with `satisfies Interface`. Never `as unknown as`.
  - **TS2532 / TS18048 (possibly undefined)**: replace `arr[0].x` with an explicit `expect(arr[0]).toBeDefined()` followed by a non-null narrowing via `const first = arr[0]; if (!first) throw new Error('…');`, or use `.at(0)!` only where the preceding assertion already established presence. Prefer the explicit guard.
  - **TS2536 (indexing a generic)**: constrain the helper's generic (`R extends { target: unknown }`) or index through `keyof R`.
  - **TS2552 / TS2304 (cannot find name)**: add the missing import from `vitest` (`vi`, `beforeEach`) — `globals: true` is set only in Angular's vitest config, and even there the type is not ambient.
  - **TS2345 (`unknown` argument)**: narrow at the call site with a type predicate or an explicit `String(...)`/`typeof` check — the argument came from `JSON.parse`, treat it as such.
  - **TS2353 (unknown property in literal)**: the fixture carries a field the type dropped; delete the field from the fixture.
  - **TS2783 / TS2677 / TS7053 / TS2339**: read the message; each is one of the above in disguise.

  After each file: `npx vitest run <that spec>` must still pass — a type fix that changes what a test asserts is a wrong fix.

- [ ] **Step 3: Confirm zero** — `npx tsc -p tsconfig.typecheck.json` in each of the three packages → exit 0, no output. `TURBO_FORCE=1 npm test` → 10/10.

- [ ] **Step 4: Commit** (leave `tsconfig.typecheck.json` files uncommitted here; they belong to Task 17):

```bash
git add packages/Entities/src packages/Server/src packages/Angular/src
git status --short   # only *.spec.ts and __tests__/fakes.ts should be staged
git commit -F - <<'EOF'
test: seventy type errors in specs nothing compiled, fixed without touching production code

Every package excludes its spec globs from tsc, Vitest does not type-check, and no
typecheck script exists anywhere — so a spec calling a signature that was replaced two
commits earlier compiled, ran, and passed for the wrong reason (round two's finding 10),
and a comment saying a widened union "must red the build" was simply false. Fixture
partials, mock shapes, unguarded array access, missing vitest imports. No test's
assertion changed; each file's suite was re-run after its fix.

The PR body and changeset said this needed "five" errors fixed. It needed seventy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L25ewntwnavMB5G8gAmnQK
EOF
```

---

## Commit 7 — The typecheck gate

### Task 17: `npm run typecheck` fans out and runs in CI

**Files:**
- Create: `packages/{Entities,CoreEntitiesServer,Server,Actions,Angular}/tsconfig.typecheck.json`
- Modify: `packages/*/package.json` (add `typecheck` script), root `package.json`, `turbo.json`, `.github/workflows/build.yml`

- [ ] **Step 1: Per-package config** — write to each of the five packages:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true },
  "exclude": ["node_modules", "dist"]
}
```

(`exclude` deliberately omits the spec globs the base config lists — that omission IS the gate.)

Add to each package's `package.json` `scripts`: `"typecheck": "tsc -p tsconfig.typecheck.json"`.

- [ ] **Step 2: Root and turbo** — root `package.json` scripts: `"typecheck": "turbo --log-order=stream typecheck --filter=\"@mj-biz-apps/forms-*\""`. `turbo.json` tasks:

```json
    "typecheck": {
      "outputs": [],
      "cache": true,
      "dependsOn": ["^build"],
      "persistent": false
    },
```

(`dependsOn ^build`: a spec imports sibling packages by their `dist` types.)

- [ ] **Step 3: Run it** — `cd <root> && TURBO_FORCE=1 npm run typecheck` → 5/5 successful.

- [ ] **Step 4: Prove the gate bites** — append `const TYPE_ERROR: number = 'not a number';` to `packages/CoreEntitiesServer/src/magic-link/__tests__/provision-runner.spec.ts`, run `npm run typecheck` → **fails** naming that line. Remove the line; `git diff --stat` on the spec is empty.

- [ ] **Step 5: CI** — `.github/workflows/build.yml`, after `Build all packages`:

```yaml
      # Specs were excluded from tsc in every package and Vitest does not type-check, so nothing in
      # this repo had ever compiled a test file. Seventy errors accumulated, including a call to a
      # signature that had been replaced — which passed, for the wrong reason.
      - name: Typecheck (including specs)
        run: npm run typecheck
```

- [ ] **Step 6: Update the doctrine** — `.claude/rules/testing.md`, under "## Running tests", add:

```
npm run typecheck           # tsc --noEmit per package WITH specs included — nothing else compiles a test file
npm run lint:guard-mutants  # neutralise each declared load-bearing guard; its package suite must go red
```

And under "## Writing tests", add one bullet:

```
- **A test that reads source text asserts presence, not behaviour.** It cannot see a condition or a
  sequence. Mutation testing found seventeen guards this repo's own comments call load-bearing that
  could be deleted with the suite green, every one behind a `readFileSync` spec. If the class can be
  instantiated — `vi.mock` the generated base; `runInInjectionContext(Injector.create(...))` for a
  component with field `inject()`; bare `new` for a service without constructor injection — test the
  behaviour and add the guard to `scripts/check-guard-mutants.mjs`. Reserve source-text for template
  text and for the cheap "the call still exists" smoke, and title it as exactly that.
```

- [ ] **Step 7: Commit**

```bash
git add packages/*/tsconfig.typecheck.json packages/*/package.json package.json turbo.json .github/workflows/build.yml .claude/rules/testing.md
git commit -F - <<'EOF'
test(gates): typecheck every spec in CI

One tsconfig per package that extends the real one, sets noEmit, and drops the spec
globs from exclude — that omission is the gate. Fans out through turbo after build,
since specs import sibling packages' dist types. Verified to bite: a deliberate type
error in a spec fails the run and names the line.

The testing rule now names both new instruments and states the source-text limit that
four review rounds kept rediscovering.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L25ewntwnavMB5G8gAmnQK
EOF
```

---

## Final verification and hand-off

### Task 18: Everything, fresh

- [ ] `cd <root> && TURBO_FORCE=1 pnpm run build:packages` — 5/5.
- [ ] `TURBO_FORCE=1 npm test` — 10/10; record per-package counts.
- [ ] `TURBO_FORCE=1 npm run typecheck` — 5/5.
- [ ] `for g in lint:migrations lint:distribution lint:ui lint:generated lint:distribution:mutants lint:guard-mutants:test lint:guard-mutants; do npm run $g || echo "FAILED: $g"; done` — none failed; distribution mutants reads 75; guard mutants all KILLED.
- [ ] Both smokes against a booted server — the reissue change touches the live write path:
  `set -a && . ./.env && set +a && pnpm run smoke:credentials` → 28/28;
  `pnpm run smoke:credentials:least-privilege` → 16/16, `seeded principal removed`. (No port export: the smokes claim their own via `smoke-harness-env.mjs`; `FORMS_SMOKE_PORT` overrides.)
- [ ] `git status --short` — clean. `git log --oneline -8` — seven new commits above `9386836`.
- [ ] `git push origin feat/104-link-credential-lifecycle`.

### Task 19: The PR body

- [ ] Pull the body (`gh pr view 109 --json body -q .body > $SP/pr109-body.md`), then:
  - Replace `five pre-existing errors fixed in unrelated specs` with the seventy and the per-package table.
  - Add a section **"Round four — ten findings, and the reason there was a round four"** after "The seventeenth", listing the ten with the fix for each, the two rejected on the merits (the `realignExpiry` skip — reintroduces round one's cleared-`CloseAt` defect; and nothing else was rejected), and the diagnosis: the repo could not distinguish a test that constrains behaviour from one that mentions it; the two instruments that now can.
  - Update the Evidence table's head SHA and totals; add rows for `npm run typecheck` and `lint:guard-mutants`.
  - Strike the *Still open* bullet on concurrency (#114 §2) — closed by the single-save reissue — and leave the browser pass, the PG twin, and "`V202608302210` has never moved a real row" standing.
- [ ] `gh pr edit 109 --body-file $SP/pr109-body.md`; `gh pr checks 109 --watch --interval 20` → all pass.
