#!/usr/bin/env node
/**
 * Guard-mutation gate for PRODUCT code — does a test actually die when a load-bearing guard is
 * neutralised?
 *
 * `check-distribution-seed.mutants.mjs` asks this of a gate SCRIPT and has for months; nobody had
 * asked it of the code the repo ships. Asked, the answer was seventeen survivors, every one in a
 * source-text spec: the client-write refusal on the credential columns deleted outright, the
 * delete/revoke order reversed, both halves of "open" dropped — suite green throughout. This
 * generalises the same instrument: apply one textual mutation to one source file, run the spec
 * files that cover it, restore, and require the run to have FAILED. A mutant that stays green
 * fails the gate and names the guard.
 *
 * MANIFEST discipline, inherited from the sibling harness:
 *   - `find` must match the source EXACTLY once. A drifted anchor is NOT APPLIED and fatal —
 *     a silently unapplied mutant reads exactly like a healthy one.
 *   - `killedBy` must name the spec file(s) that actually fail under the mutation, relative to the
 *     suite. Deriving it is not guesswork: apply the mutant, run the suite under
 *     `--reporter=json`, and read back which files failed. A stale entry matches no test file and
 *     the run CRASHES rather than passing quietly, and check-guard-mutants.spec.mjs asserts every
 *     one of them still exists at PR time, for free.
 *   - Those spec files must pass unmutated first (BASELINE). A suite that is red for another
 *     reason would report every mutant as killed and measure nothing. The baseline covers exactly
 *     the files the mutants use, because a test no mutant runs cannot skew a verdict either way.
 *   - A run that produces no vitest summary is CRASHED, not killed. A compile error in the
 *     mutated file also reads as a failed run, so every `replace` below is code that COMPILES —
 *     a mutant killed by tsc would be killed for the wrong reason.
 *
 * Cost: one run of the spec files named by `killedBy` per mutant, serial. Serial is still the
 * right call — a worker pool is more harness to own, and two mutants cannot share a checkout
 * anyway because each is an in-place edit to the source tree they both read.
 *
 * `killedBy` is what keeps serial affordable, and it was not always there. This gate ran each
 * mutant against its ENTIRE package suite, which on a CI runner is 37.5s for packages/Server —
 * 15 mutants and a baseline deep, 600s, two thirds of the whole `build-and-test` job and the
 * reason it took fifteen minutes. Almost none of that was testing: Server's 996 tests run in
 * 800ms, and the other ~89s is vitest collecting 78 spec files, of which one or two can possibly
 * observe an edit to one source file.
 *
 * Node stdlib only and no build step, like its sibling, so CI runs it without an install step of
 * its own — but the package suites it runs DO need the workspace built, since they import each
 * other's dist. Run after `pnpm run build:packages`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUITE_TIMEOUT_MS = 180_000;

/**
 * Every entry is a guard the codebase calls load-bearing, expressed as the smallest COMPILING edit
 * that removes it. `behaviour` says what the reader loses, because that is what a SURVIVED message
 * has to tell someone who has never read the source.
 */
export const MUTANTS = [
  // --- respondent submission: the ONE ownership rule on the anonymous write path -------------
  {
    name: 'scope/ownership-gate-neutralised',
    behaviour: 'a caller may only act on a response their own session owns, or an unowned one',
    file: 'packages/CoreEntitiesServer/src/submission/persistence.ts',
    find: "  if (owner === '' || owner === foldId(caller.sessionId)) {",
    replace: "  if (true || owner === '' || owner === foldId(caller.sessionId)) {",
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/submission/__tests__/response-scope-ownership.spec.ts',
      'src/engines/__tests__/submission/session-ownership.spec.ts',
    ],
  },
  {
    name: 'scope/absent-credential-more-permissive-than-a-wrong-one',
    behaviour: 'a MISSING session header is refused exactly as a forged one is — never treated as a match',
    file: 'packages/CoreEntitiesServer/src/submission/persistence.ts',
    find: "  if (owner === '' || owner === foldId(caller.sessionId)) {",
    replace: "  if (owner === '' || foldId(caller.sessionId) === '' || owner === foldId(caller.sessionId)) {",
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/submission/__tests__/response-scope-ownership.spec.ts',
      'src/engines/__tests__/submission/session-ownership.spec.ts',
    ],
  },
  {
    name: 'scope/blank-jwt-scope-matches-nothing',
    behaviour: 'a session with no response scope is admitted to no row — an empty claim is not a key',
    file: 'packages/CoreEntitiesServer/src/submission/persistence.ts',
    find: "  return scope !== '' && scope === foldId(response.ID);",
    replace: "  return scope === foldId(response.ID);",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/submission/__tests__/response-scope-ownership.spec.ts'],
  },
  // --- respondent-host: the two defects the #138 design review found -------------------------
  {
    name: 'resume/consumed-pointer-must-not-clear-the-cookie',
    behaviour: 'a second tab losing the redeem race leaves the winner\'s rotated pointer alone, so the real draft is not orphaned',
    file: 'packages/Server/src/respondent-host/device-resume.service.ts',
    find: "  if (errorCode === 'consumed') {\n    return { status: 410, reason: 'open-elsewhere' };\n  }",
    replace: "  if (errorCode === 'consumed') {\n    return { status: 410, reason: 'open-elsewhere', setCookie: deps.clearCookie() };\n  }",
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/device-resume.service.spec.ts'],
  },
  {
    name: 'resume/remember-requires-the-owning-session-id',
    behaviour: 'a device pointer is never minted on a bare response id — the header is a first sitting\'s only ownership proof',
    file: 'packages/Server/src/respondent-host/device-resume.service.ts',
    find: "  if (!args.responseId || !args.sessionId.trim()) {",
    replace: "  if (!args.responseId) {",
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/device-resume.service.spec.ts'],
  },
  {
    name: 'resume/pointer-to-a-live-draft-is-not-replaced',
    behaviour: 'a pointer naming another LIVE draft is never overwritten, so a losing tab cannot abandon the real one',
    file: 'packages/Server/src/respondent-host/device-resume.service.ts',
    find: "  const held = await heldPointer(deps, args);\n  if (held.conflict) {",
    replace: "  const held = await heldPointer(deps, args);\n  if (held.conflict && false) {",
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/device-resume.service.spec.ts'],
  },
  // --- public-submit: a half-understood snapshot is never served to a respondent ------------
  {
    name: 'resume/superseded-pointer-not-retired',
    behaviour: 'a re-mint retires the invite it supersedes, so one draft never has two live pointers',
    file: 'packages/Server/src/respondent-host/device-resume.service.ts',
    find: "    await deps.revokeInvite({ inviteId: held.supersededInviteId, responseId: args.responseId });",
    replace: "    void held.supersededInviteId;",
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/device-resume.service.spec.ts'],
  },
  {
    name: 'resume/cross-link-draft-admitted',
    behaviour: 'a draft whose KNOWN link is not the slug in hand is refused a pointer',
    file: 'packages/Server/src/respondent-host/device-resume.service.ts',
    find: "  if (rowLink !== '' && rowLink !== foldId(distribution.id)) {",
    replace: "  if (false && rowLink !== '' && rowLink !== foldId(distribution.id)) {",
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/device-resume.service.spec.ts'],
  },
  {
    name: 'snapshot/malformed-question-dropped-instead-of-failing',
    behaviour: 'one malformed QUESTION fails the whole snapshot rather than silently vanishing from the form',
    file: 'packages/CoreEntitiesServer/src/shared/snapshot-parser.ts',
    find: '    if (!q) {\n      return undefined;\n    }',
    replace: '    if (!q) {\n      continue;\n    }',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/shared/__tests__/snapshot-parser.spec.ts'],
  },
  // --- respondent-host door: the refusals that happen BEFORE a credential is minted ----------
  {
    name: 'door/version-read-failure-reported-as-unpublished',
    behaviour: 'a FAILED published-version read is 502 redeem-failed, never 409 "not published yet"',
    file: 'packages/Server/src/respondent-host/redeem.service.ts',
    find: '  if (published === undefined) {\n    return { ok: false, reason: \'redeem-failed\' };\n  }',
    replace: '  if (false) {\n    return { ok: false, reason: \'redeem-failed\' };\n  }',
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/redeem.service.spec.ts'],
  },
  {
    name: 'door/missing-credential-outranked-by-the-calendar',
    behaviour: 'a link with no PublicLinkToken is "not ready", ahead of any not-yet-open or full reason',
    file: 'packages/Server/src/respondent-host/redeem.service.ts',
    find: "  const rawToken = dist.PublicLinkToken;\n  if (!rawToken) {\n    return { verdict: 'refuse', reason: 'no-token' };\n  }",
    replace: "  const rawToken = dist.PublicLinkToken ?? 'guard-neutralised';",
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/redeem.service.spec.ts'],
  },
  {
    name: 'door/opening-time-not-checked-for-being-future',
    behaviour: 'an opening time that is not ahead of the reader is not named, and sets no Retry-After',
    file: 'packages/Server/src/respondent-host/error-view.ts',
    find: '  const knowsWhen = opensAt !== undefined && !Number.isNaN(opensAt.getTime()) && opensAt > now;',
    replace: '  const knowsWhen = opensAt !== undefined && !Number.isNaN(opensAt.getTime());',
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/middleware-error-view.spec.ts'],
  },
  {
    name: 'door/retry-after-dropped',
    behaviour: 'a temporary refusal puts Retry-After on the wire, so a monitor records "later" not "gone"',
    file: 'packages/Server/src/respondent-host/error-view.ts',
    find: "  if (view.retryAfter) {",
    replace: "  if (false) {",
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/middleware-error-view.spec.ts'],
  },
  // --- FormDistributionEntityServer: the credential columns are server-owned -----------------
  {
    name: 'hook/client-write-guard-neutralised',
    behaviour: 'a client write of MagicLinkInviteID / PublicLinkToken is refused before super.Save()',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '  private refuseClientCredentialWrites(): void {\n    if (this.credentialWriteInFlight) {',
    replace: '  private refuseClientCredentialWrites(): void {\n    if (true) { return; }\n    if (this.credentialWriteInFlight) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/token-rule-inverted',
    behaviour: 'a client may CLEAR PublicLinkToken (the reissue request) but never SET one',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: "    if (token?.Dirty && token.Value !== null && token.Value !== '') {",
    replace: "    if (token?.Dirty && (token.Value === null || token.Value === '')) {",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/invite-id-restored-from-old-value',
    behaviour: 'a dirty MagicLinkInviteID is restored to its OLD value, not trusted',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '    if (invite?.Dirty) {',
    replace: '    if (invite?.Dirty && !invite.OldValue) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/create-strip',
    behaviour: 'a credential supplied on CREATE is stripped',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '      if (this.MagicLinkInviteID || this.PublicLinkToken) {',
    replace: '      if (false) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/reentrancy-guard-finally',
    behaviour: 'the in-flight guard is reset in a finally, so a throw cannot wedge the record',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '    } finally {\n      this.credentialWriteInFlight = false;\n    }',
    replace: '    } finally {\n      /* wedged */\n    }',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/delete-before-revoke',
    behaviour: 'inside the transaction, Delete() runs super.Delete FIRST — a refused delete then commits no revoke',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    // A real, compiling reorder: revoke first, then delete. A refused delete then returns false and
    // the transaction COMMITS the revoke — a live link's credential dead over a bounced delete.
    find: "        if (!(await super.Delete(options))) {\n          return false;\n        }\n        const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser, host);",
    replace: "        const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser, host);\n        if (!(await super.Delete(options))) {\n          return false;\n        }",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/delete-revoke-outside-transaction',
    behaviour: "the revoke is created on the row's own provider, so it joins the delete's transaction",
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: "        const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser, host);",
    replace: "        const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser);",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/delete-revoke-failure-swallowed',
    behaviour: 'a failed revoke rolls the delete back and refuses it, rather than committing an orphan',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: "        if (!revoked.success) {\n          throw new Error(revoked.message ?? 'unknown error');\n        }",
    replace: "        if (!revoked.success) {\n          LogError(revoked.message ?? 'unknown error');\n        }",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  // --- FormDistributionEntityServer: a save carries the STORED pair, and writers take turns on a row lock
  {
    name: 'hook/adopt-neutralised',
    behaviour: 'an update re-reads the credential pair from the store, so a stale instance cannot revert a rotation',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: "  private async adoptStoredCredential(): Promise<void> {\n    if (this.credentialWriteInFlight || !this.IsSaved) {",
    replace: "  private async adoptStoredCredential(): Promise<void> {\n    if (true) { return; }\n    if (this.credentialWriteInFlight || !this.IsSaved) {",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/adopt-drops-clear',
    behaviour: 'adopting the stored pair keeps a token this client CLEARED — the reissue request survives',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '    this.PublicLinkToken = clearRequested ? null : stored.PublicLinkToken;',
    replace: '    this.PublicLinkToken = stored.PublicLinkToken;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/turn-outside-transaction',
    behaviour: 'an update runs inside one transaction, so the row lock it takes is held until the save commits',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '      return await RunInEntityTransaction(this.ProviderToUse, () => this.saveAndProvision(options, host));',
    replace: '      return await this.saveAndProvision(options, host);',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/provision-host-dropped',
    behaviour: "an update save hands the minter the row's provider, so a rolled-back save (or archive) undoes its invite writes",
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '      return await RunInEntityTransaction(this.ProviderToUse, () => this.saveAndProvision(options, host));',
    replace: '      return await RunInEntityTransaction(this.ProviderToUse, () => this.saveAndProvision(options));',
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts',
      'src/entities/__tests__/FormEntityServer.behaviour.spec.ts',
    ],
  },
  {
    name: 'entities/skip-async-validation-unguarded',
    behaviour: 'a save with SkipAsyncValidation: true still runs the invariants (MJ would skip ValidateAsync)',
    file: 'packages/CoreEntitiesServer/src/entities/entity-refusal.ts',
    find: "  const skipped = options?.ReplayOnly ? 'ReplayOnly' : options?.SkipAsyncValidation === true ? 'SkipAsyncValidation' : null;",
    replace: "  const skipped = options?.ReplayOnly ? 'ReplayOnly' : null;",
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/entities/__tests__/FormVersionEntityServer.behaviour.spec.ts',
      'src/entities/__tests__/FormEntityServer.behaviour.spec.ts',
      'src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts',
    ],
  },
  {
    name: 'entities/untracked-update-trusted',
    behaviour: 'with TrackRecordChanges off, an update is refused rather than trusting client-supplied old values',
    file: 'packages/CoreEntitiesServer/src/entities/entity-refusal.ts',
    find: '  if (!entity.IsSaved || tracksStoredValues(entity)) {',
    replace: '  if (true) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/entities/__tests__/FormVersionEntityServer.behaviour.spec.ts',
      'src/entities/__tests__/FormEntityServer.behaviour.spec.ts',
    ],
  },
  {
    name: 'hook/row-lock-dropped',
    behaviour: 'the credential re-read takes an update lock, so a second writer of the row waits its turn',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '          : `SELECT ${columns} FROM ${table} WITH (UPDLOCK, HOLDLOCK) WHERE ${where}`;',
    replace: '          : `SELECT ${columns} FROM ${table} WHERE ${where}`;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/origins-grammar-neutralised',
    behaviour: 'a write of AllowedOrigins holding a non-origin entry is refused, for every writer',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '      const refusal = allowedOriginsRefusal(this.AllowedOrigins);',
    replace: '      const refusal = null;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  // --- FormDistributionEntityServer: the context is built from the columns of the same meaning --
  {
    name: 'hook/ctx-isactive-mismapped',
    behaviour: "the decision reads the row's IsActive, not a constant",
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '          isActive: this.IsActive,',
    replace: '          isActive: true,',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'hook/ctx-closeat-dropped',
    behaviour: "the mint is bounded by the row's CloseAt",
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '          closeAt: this.CloseAt,',
    replace: '          closeAt: null,',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts'],
  },
  // --- Form / FormVersion entity server subclasses: invariants for every writer (#303 §7) -----
  {
    name: 'entities/version-insert-engine-check-dropped',
    behaviour: 'only the publishing engine may create a FormVersion as Published (DW5)',
    file: 'packages/CoreEntitiesServer/src/entities/form-version-rules.ts',
    find: "  if (write.status === 'Draft' || write.authorizedByEngine) {",
    replace: '  if (true) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/entities/__tests__/form-version-rules.spec.ts',
      'src/entities/__tests__/FormVersionEntityServer.behaviour.spec.ts',
    ],
  },
  {
    name: 'entities/version-snapshot-unfrozen',
    behaviour: 'DefinitionSnapshot / VersionNumber / FormID never change on a Published or Retired version (DW5)',
    file: 'packages/CoreEntitiesServer/src/entities/FormVersionEntityServer.ts',
    find: '      changedFields: changedFields(this, FROZEN_VERSION_FIELDS),',
    replace: '      changedFields: [],',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/entities/__tests__/FormVersionEntityServer.behaviour.spec.ts'],
  },
  {
    name: 'entities/archive-leaves-distributions-open',
    behaviour: 'archiving a form closes its Active distributions in the same transaction (DW15)',
    file: 'packages/CoreEntitiesServer/src/entities/FormEntityServer.ts',
    find: '        await this.CloseActiveDistributions();',
    replace: '        /* distributions left open */',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/entities/__tests__/FormEntityServer.behaviour.spec.ts'],
  },
  // --- provision-runner: the reissue is one save ----------------------------------------------
  {
    name: 'runner/reissue-single-save',
    behaviour: 'a reissue writes the new pair in ONE save, never an intermediate (null, null)',
    file: 'packages/CoreEntitiesServer/src/magic-link/provision-runner.ts',
    find: "    const revoked = await revokeInvite(ctx, minter, contextUser);\n    if (revoked !== 'revoked') {\n      return { result: revoked, inviteId: ctx.magicLinkInviteId ?? undefined };\n    }\n    return issueCredential(",
    replace: "    const revoked = await revokeInvite(ctx, minter, contextUser);\n    if (revoked !== 'revoked') {\n      return { result: revoked, inviteId: ctx.magicLinkInviteId ?? undefined };\n    }\n    await persistCredential(null);\n    return issueCredential(",
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts',
      'src/magic-link/__tests__/provision-runner.spec.ts',
    ],
  },
  // --- FormPublishingEngine / Forms.PublishForm: the one writer that publishes (#303) ----------
  {
    name: 'engine/publish-skips-rule-gate',
    behaviour: 'a form whose rules are broken is refused, with the rules named, and nothing is written',
    file: 'packages/CoreEntitiesServer/src/engines/FormPublishingEngine.ts',
    find: '    if (broken.length > 0) {',
    replace: '    if (false && broken.length > 0) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormPublishingEngine.spec.ts'],
  },
  {
    name: 'engine/unit-of-work-outside-transaction',
    behaviour: 'an engine unit of work is one transaction: a failure part-way leaves nothing written (publish and build)',
    file: 'packages/CoreEntitiesServer/src/engines/engine-guards.ts',
    find: '      return await RunInEntityTransaction(provider, async () => {',
    replace: '      return await (async (run: () => Promise<T>) => run())(async () => {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/engines/__tests__/FormPublishingEngine.spec.ts',
      'src/engines/__tests__/FormAuthoringEngine.spec.ts',
      'src/engines/__tests__/FormAuthoringEngine.clone.spec.ts',
    ],
  },
  {
    name: 'engine/flag-left-raised',
    behaviour: 'the engine privilege covers one save only: AuthorizedByEngine is lowered again whatever the save did',
    file: 'packages/CoreEntitiesServer/src/engines/engine-guards.ts',
    find: '  } finally {\n    entity.AuthorizedByEngine = false;\n  }',
    replace: '  } finally {\n    void entity;\n  }',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/engine-guards.spec.ts'],
  },
  {
    name: 'engine/transaction-failure-reaches-caller',
    behaviour: "a failed BEGIN or COMMIT reaches the caller as a fixed sentence, never the driver's text (Task 6 carry)",
    file: 'packages/CoreEntitiesServer/src/engines/engine-guards.ts',
    find: '      throw new EngineTransactionFailure(err);',
    replace: '      throw err;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/engine-guards.spec.ts'],
  },
  // --- Task 7 fix round: the run row as the event's idempotency record --------------------------
  {
    name: 'dispatch/transient-failure-recorded-terminal',
    behaviour: 'a transient step failure leaves its run Pending (re-run on redelivery); only a permanent one is Failed',
    file: 'packages/CoreEntitiesServer/src/automation/dispatch-automation.ts',
    find: "    await closeRun(run, retryable ? 'Pending' : 'Failed', message, error instanceof AutomationFailure ? error.outcome : {});",
    replace: "    await closeRun(run, 'Failed', message, error instanceof AutomationFailure ? error.outcome : {});",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/automation/__tests__/dispatch-automation.spec.ts'],
  },
  {
    name: 'dispatch/success-recorded-once-or-never',
    behaviour: "a succeeded step's run row is closed with a capped retry, so one dropped write does not re-run the step",
    file: 'packages/CoreEntitiesServer/src/automation/dispatch-automation.ts',
    find: '  for (let attempt = 1; attempt <= MAX_SUCCESS_RECORD_ATTEMPTS; attempt++) {',
    replace: '  for (let attempt = 1; attempt <= 1; attempt++) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/automation/__tests__/dispatch-automation.spec.ts'],
  },
  {
    name: 'runner/redelivery-forgets-a-halting-failure',
    behaviour: 'a permanent failure that halted later sync steps halts them on every redelivery too',
    file: 'packages/CoreEntitiesServer/src/automation/automation-runner.ts',
    find: '      if (haltsLaterSteps(planned)) {',
    replace: '      if (false && haltsLaterSteps(planned)) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/automation/__tests__/automation-runner.spec.ts'],
  },
  {
    name: 'handler/last-attempt-leaves-rows-running',
    behaviour: "on the subscription's last attempt the delivery is dead-lettered and its open rows closed, never left Running",
    file: 'packages/CoreEntitiesServer/src/work-queue/RunAutomationsHandler.ts',
    find: "  if (outcome.Kind !== 'Retry' || context.Attempt < context.MaxAttempts) {",
    replace: '  if (true) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/work-queue/__tests__/RunAutomationsHandler.spec.ts'],
  },
  {
    name: 'automation/stale-partial-delivery-runs',
    behaviour: 'a partial-save delivery whose response is already Complete is stale: it runs nothing and writes no run row',
    file: 'packages/CoreEntitiesServer/src/engines/automation-run.ts',
    find: "  if (request.trigger === 'OnPartial' && loaded.response.Status === 'Complete') {",
    replace: "  if (false && request.trigger === 'OnPartial' && loaded.response.Status === 'Complete') {",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAutomationEngine.run.spec.ts'],
  },
  {
    name: 'message/publish-request-unpartitioned',
    behaviour: "every forms.response-submitted request carries the response id as partition key, so the Ordered subscription orders one response's messages",
    file: 'packages/CoreEntitiesServer/src/work-queue/response-submitted.ts',
    find: '    PartitionKey: valid.ResponseID.toLowerCase(),',
    replace: '    PartitionKey: undefined,',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/work-queue/__tests__/response-submitted.spec.ts'],
  },
  {
    name: 'handler/partial-save-dead-letters',
    behaviour: "a partial save never dead-letters, so under Ordered it can never block its response's final message",
    file: 'packages/CoreEntitiesServer/src/work-queue/RunAutomationsHandler.ts',
    find: '    if (!partial) {\n      return outcome;\n    }',
    replace: '    if (true) {\n      return outcome;\n    }',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/work-queue/__tests__/RunAutomationsHandler.spec.ts', 'src/work-queue/__tests__/ordered-delivery.spec.ts'],
  },
  {
    name: 'automation/replay-leaves-dead-lettered-steps-closed',
    behaviour: "replaying a dead-lettered final reopens the rows its dead letter closed, so the replay runs those steps",
    file: 'packages/CoreEntitiesServer/src/engines/automation-run.ts',
    find: "    const reopened = isReplay && row.Status === 'Failed' && (row.ErrorMessage ?? '').startsWith(DEAD_LETTERED_RUN_PREFIX);",
    replace: '    const reopened = false;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAutomationEngine.run.spec.ts'],
  },
  {
    name: 'handler/unexpected-throw-leaves-rows-open',
    behaviour: 'an unexpected throw on the last attempt closes the open rows before dead-lettering (re-review B3)',
    file: 'packages/CoreEntitiesServer/src/work-queue/RunAutomationsHandler.ts',
    find: "      return this.settle(Outcome.Retry('The automations could not be run on this attempt; the server log has the detail.'), payload, eventMessageId, context);",
    replace: "      return lastAttemptGuard(Outcome.Retry('The automations could not be run on this attempt; the server log has the detail.'), context);",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/work-queue/__tests__/RunAutomationsHandler.spec.ts'],
  },
  {
    name: 'dispatch/new-run-row-unstamped',
    behaviour: "every run row a delivery opens carries that message's id, the exact identity a redelivery matches on",
    file: 'packages/CoreEntitiesServer/src/automation/dispatch-automation.ts',
    find: '    row.WorkQueueMessageID = ctx.workQueueMessageId;',
    replace: '    row.WorkQueueMessageID = null;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/automation/__tests__/dispatch-automation.spec.ts'],
  },
  // --- FormAutomationEngine + the Forms.RunAutomations work-queue handler (#303 Task 7) --------
  {
    name: 'binding/unverified-respondent-updates-matched-record',
    behaviour: "an unverified respondent never updates a matched record: the match is recorded, nothing is written (DW12)",
    file: 'packages/CoreEntitiesServer/src/binding/binding-executor.ts',
    find: '  if (match.existing && !input.respondentVerified) {',
    replace: '  if (false && match.existing && !input.respondentVerified) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/binding/__tests__/binding-executor.spec.ts'],
  },
  {
    name: 'automation/run-claims-a-verified-respondent',
    behaviour: 'every automation run is stamped RespondentVerified: false until a verified recipient session exists (#137)',
    file: 'packages/CoreEntitiesServer/src/engines/automation-run.ts',
    find: '    respondentVerified: false,',
    replace: '    respondentVerified: true,',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAutomationEngine.run.spec.ts'],
  },
  {
    name: 'automation/redelivery-reruns-terminal-step',
    behaviour: 'a redelivery does not re-run a step whose run is terminal for the event — Succeeded, Failed or Skipped (DW11)',
    file: 'packages/CoreEntitiesServer/src/automation/automation-plan.ts',
    find: '  if (prior && TERMINAL_RUN_STATES.has(prior.status)) {',
    replace: '  if (false && prior && TERMINAL_RUN_STATES.has(prior.status)) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/automation/__tests__/automation-plan.spec.ts', 'src/engines/__tests__/FormAutomationEngine.run.spec.ts'],
  },
  {
    name: 'automation/plan-from-live-rows-not-snapshot-binding',
    behaviour: "a binding step writes with the PUBLISHED version's settings, not the live row's",
    file: 'packages/CoreEntitiesServer/src/automation/dispatch-automation.ts',
    find: '  const frozen = automation.binding;',
    replace: '  const frozen = undefined as PublishedFormAutomation[\'binding\'];',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/automation/__tests__/binding-attachments.spec.ts'],
  },
  {
    name: 'automation/non-complete-response-fires-completion-steps',
    behaviour: 'a final-submit message for a response that is not Complete (a Disqualified one) runs nothing',
    file: 'packages/CoreEntitiesServer/src/engines/automation-run.ts',
    find: "  if (request.trigger === 'OnComplete' && loaded.response.Status !== 'Complete') {",
    replace: "  if (false && request.trigger === 'OnComplete' && loaded.response.Status !== 'Complete') {",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAutomationEngine.run.spec.ts'],
  },
  {
    name: 'automation/async-step-shares-the-delivery-provider',
    behaviour: 'each Async step runs on an isolated instance of its own, never the provider its siblings share (#260)',
    file: 'packages/CoreEntitiesServer/src/engines/automation-run.ts',
    find: "  if (automation.executionMode !== 'Async') {\n    return dispatchAutomation(automation, { ...context, provider }, openRunId);\n  }",
    replace: "  if (true) {\n    return dispatchAutomation(automation, { ...context, provider }, openRunId);\n  }",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAutomationEngine.run.spec.ts'],
  },
  {
    name: 'automation/runs-of-another-message-count',
    behaviour: "a run belongs to a delivery's event only when it carries that message's id: no save's runs are mistaken for another's (B2, the final race)",
    file: 'packages/CoreEntitiesServer/src/engines/automation-run.ts',
    find: "  return typeof stamped === 'string' && stamped.trim().toLowerCase() === event;",
    replace: "  return typeof stamped === 'string';",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAutomationEngine.run.spec.ts'],
  },
  {
    name: 'automation-edit/seeds-on-an-authoritative-form',
    behaviour: 'built-ins are seeded only when an edit turns the form\'s own steps on — never again after the author removed them all',
    file: 'packages/CoreEntitiesServer/src/engines/automation-editing.ts',
    find: '  const seeded = dispatchesLegacy(settings.value, loaded.steps.length) ? await seedLegacySteps(loaded, provider, user) : [];',
    replace: '  const seeded = loaded.steps.length === 0 ? await seedLegacySteps(loaded, provider, user) : [];',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAutomationEngine.edit.spec.ts'],
  },
  {
    name: 'automation-edit/reorder-ignores-sync-before-async',
    behaviour: 'a reorder placing an Async step ahead of a Sync one is refused, not saved and ignored by the runner',
    file: 'packages/CoreEntitiesServer/src/engines/automation-editing.ts',
    find: "  if (firstAsync >= 0 && ordered.slice(firstAsync).some((step) => step.ExecutionMode === 'Sync')) {",
    replace: "  if (false && firstAsync >= 0 && ordered.slice(firstAsync).some((step) => step.ExecutionMode === 'Sync')) {",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAutomationEngine.edit.spec.ts'],
  },
  {
    name: 'automation-edit/remove-deletes-binding-or-skips-mark',
    behaviour: 'removing a step marks the form authoritative, so removing the last one means "run nothing" (#47)',
    file: 'packages/CoreEntitiesServer/src/engines/automation-editing.ts',
    find: '  const loaded = await loadFormSteps(step.FormID, provider, user);\n  const seeded = await ensureFormRunsItsOwnSteps(loaded, provider, user);',
    replace: '  const loaded = await loadFormSteps(step.FormID, provider, user);\n  const seeded: { ID: string }[] = [loaded][0] ? [] : [];',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAutomationEngine.edit.spec.ts'],
  },
  {
    name: 'handler/dead-letters-a-retryable-failure',
    behaviour: 'a failed read is retried, a response that does not exist is dead-lettered — never the other way round',
    file: 'packages/CoreEntitiesServer/src/work-queue/RunAutomationsHandler.ts',
    find: '        return err.retryable ? Outcome.Retry(err.message) : Outcome.DeadLetter(err.message);',
    replace: '        return Outcome.DeadLetter(err.message);',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/work-queue/__tests__/RunAutomationsHandler.spec.ts'],
  },
  {
    name: 'handler/runs-on-the-delivery-provider',
    behaviour: "the handler runs on an isolated instance of the delivery's provider, never on it directly",
    file: 'packages/CoreEntitiesServer/src/work-queue/RunAutomationsHandler.ts',
    find: '        provider,\n        this.ContextUser,\n      );',
    replace: '        this.Provider as never,\n        this.ContextUser,\n      );',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/work-queue/__tests__/RunAutomationsHandler.spec.ts'],
  },
  {
    name: 'engine/publish-promotes-before-retiring',
    behaviour: 'the incumbent is retired BEFORE the new version goes Published (UQ_FormVersion_OnePublishedPerForm)',
    file: 'packages/CoreEntitiesServer/src/engines/FormPublishingEngine.ts',
    find: '    const retiredVersionIds = await this.retire(draft.liveVersions);\n    const published: PublishedFormDefinition = { ...definition, formVersionId: version.ID };\n    await this.promote(version, published);',
    replace: '    const published: PublishedFormDefinition = { ...definition, formVersionId: version.ID };\n    await this.promote(version, published);\n    const retiredVersionIds = await this.retire(draft.liveVersions);',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormPublishingEngine.spec.ts'],
  },
  // --- FormAuthoringEngine: clone, templates, archive/restore (#303 Task 5) ---------------------
  {
    name: 'engine/clone-shares-source-binding',
    behaviour: "a copied automation runs through the COPY's binding, never the source form's map",
    file: 'packages/CoreEntitiesServer/src/engines/form-clone.ts',
    find: '      copy.BindingID = source.BindingID ? (bindingIdMap.get(source.BindingID) ?? null) : null;',
    replace: '      copy.BindingID = source.BindingID;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAuthoringEngine.clone.spec.ts'],
  },
  {
    name: 'engine/clone-drops-disqualification',
    behaviour: 'a copied knockout ending stays a knockout (IsDisqualification is carried, not just its rule)',
    file: 'packages/CoreEntitiesServer/src/engines/form-clone.ts',
    find: '      copy.IsDisqualification = source.IsDisqualification;',
    replace: '      /* IsDisqualification not copied */',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAuthoringEngine.clone.spec.ts'],
  },
  {
    name: 'engine/template-name-unchecked',
    behaviour: 'a template cannot be saved under a name another template already has (trimmed, any case)',
    file: 'packages/CoreEntitiesServer/src/engines/FormAuthoringEngine.ts',
    find: '    if (options.asTemplate) {\n      await requireFreeTemplateName(name, provider, user);',
    replace: '    if (false && options.asTemplate) {\n      await requireFreeTemplateName(name, provider, user);',
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/engines/__tests__/FormAuthoringEngine.clone.spec.ts',
      'src/operations/__tests__/AuthoringServerOperations.spec.ts',
    ],
  },
  {
    name: 'engine/restore-ignores-published-version',
    behaviour: 'restoring an archived form with a live version returns it to Published, not Draft (DW15)',
    file: 'packages/CoreEntitiesServer/src/engines/FormAuthoringEngine.ts',
    find: "live && !form.IsTemplate ? 'Published' : 'Draft'",
    replace: "'Draft'",
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/engines/__tests__/FormAuthoringEngine.lifecycle.spec.ts',
      'src/operations/__tests__/AuthoringServerOperations.spec.ts',
    ],
  },
  {
    name: 'engine/archive-again-leaves-links-open',
    behaviour: 'archiving an already-archived form closes any link still Active, in the same transaction',
    file: 'packages/CoreEntitiesServer/src/engines/FormAuthoringEngine.ts',
    find: '      if (form.Status === \'Closed\') {\n        await closeStrayLinks(form);',
    replace: '      if (form.Status === \'Closed\') {\n        void closeStrayLinks;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAuthoringEngine.lifecycle.spec.ts'],
  },
  {
    name: 'ops/authoring-authorize-admits-magic-link',
    behaviour: 'an anonymous or magic-link session can never run an authoring operation (FORBIDDEN)',
    file: 'packages/CoreEntitiesServer/src/operations/form-authoring-authorization.ts',
    find: '  if (user.IsMagicLinkAnonymous) {',
    replace: '  if (false && user.IsMagicLinkAnonymous) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/operations/__tests__/form-authoring-authorization.spec.ts',
      'src/operations/__tests__/PublishFormServerOperation.spec.ts',
      'src/operations/__tests__/AuthoringServerOperations.spec.ts',
    ],
  },
  // --- FormDistributionEngine / the share-link operations (#303 Task 6) ----------------------
  {
    name: 'engine/issue-retries-any-failure',
    behaviour: 'issuing a link retries only a slug collision; any other failure is refused at once, not retried',
    file: 'packages/CoreEntitiesServer/src/engines/FormDistributionEngine.ts',
    find: '    if (!saveFailure(link).includes(SLUG_INDEX)) {',
    replace: '    if (false && !saveFailure(link).includes(SLUG_INDEX)) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormDistributionEngine.spec.ts'],
  },
  {
    name: 'engine/open-drops-isactive',
    behaviour: 'opening a link writes IsActive = true as well as Status (a row at Active/not-IsActive is repaired)',
    file: 'packages/CoreEntitiesServer/src/engines/FormDistributionEngine.ts',
    find: "    link.Status = 'Active';\n    link.IsActive = true;\n  },",
    replace: "    link.Status = 'Active';\n  },",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormDistributionEngine.spec.ts'],
  },
  {
    name: 'engine/open-not-forced',
    behaviour: 'opening a link forces the save (IgnoreDirtyState), so an already-open row is still written',
    file: 'packages/CoreEntitiesServer/src/engines/FormDistributionEngine.ts',
    find: '  saveOptions: () => Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true }),',
    replace: '  saveOptions: undefined,',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormDistributionEngine.spec.ts'],
  },
  {
    name: 'engine/open-ignores-archived-form',
    behaviour: 'a link cannot be opened on an archived form or a template (archiving closed every link)',
    file: 'packages/CoreEntitiesServer/src/engines/FormDistributionEngine.ts',
    find: '    await readShareableForm(link.FormID, provider, user);',
    replace: '    void readShareableForm;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormDistributionEngine.spec.ts'],
  },
  {
    name: 'engine/reissue-on-a-closed-link',
    behaviour: 'reissue refuses a link that is not open, instead of reporting success having changed nothing',
    file: 'packages/CoreEntitiesServer/src/engines/FormDistributionEngine.ts',
    find: '    if (!isOpenToResponses(link)) {',
    replace: '    if (false && !isOpenToResponses(link)) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormDistributionEngine.spec.ts'],
  },
  {
    name: 'engine/claims-unreadable-slugs-read-as-none',
    behaviour: 'a failed slug read throws; it is never answered as "nobody claims these links"',
    file: 'packages/CoreEntitiesServer/src/engines/FormDistributionEngine.ts',
    find: '        if (!read.Success) {\n          // The view error can carry the SQL statement',
    replace: '        if (false && !read.Success) {\n          // The view error can carry the SQL statement',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormDistributionEngine.spec.ts'],
  },
  {
    name: 'engine/issue-inside-a-transaction',
    behaviour: "issuing a link refuses to run inside a caller's transaction (a slug collision would doom it)",
    file: 'packages/CoreEntitiesServer/src/engines/FormDistributionEngine.ts',
    find: '    if ((provider.TransactionDepth ?? 0) > 0) {',
    replace: '    if (false && (provider.TransactionDepth ?? 0) > 0) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormDistributionEngine.spec.ts'],
  },
  {
    name: 'engine/provider-text-reaches-caller',
    behaviour: "an unexpected exception's own words (SQL, other records' values) never reach the caller",
    file: 'packages/CoreEntitiesServer/src/engines/FormDistributionEngine.ts',
    find: '    if (err instanceof FormDistributionError) {\n      throw err;\n    }',
    replace: '    if (err instanceof Error) {\n      throw err;\n    }',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormDistributionEngine.spec.ts'],
  },
  {
    name: 'hook/opens-link-on-archived-form',
    behaviour: 'no writer can open a share link on an archived form — a plain entity save is refused too',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: "    return form.Status === 'Closed' ? 'This link cannot be opened: its form is archived. Restore the form first.' : null;",
    replace: '    return null;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/magic-link/__tests__/FormDistributionEntityServer.closed-form.spec.ts'],
  },
  {
    name: 'claims/unasked-slug-shown-to-author',
    behaviour: "a slug a claimant was not asked about (maybe another form's) reaches the log only, never the author",
    file: 'packages/CoreEntitiesServer/src/distribution-claims/find-claims.ts',
    find: "    log.record(appName, 'claimed a slug that was not asked about', `claimed slug \"${capForEcho(slug)}\" that was not asked about`);",
    replace: "    log.record(appName, `claimed slug \"${capForEcho(slug)}\" that was not asked about`);",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/distribution-claims/__tests__/find-claims.spec.ts'],
  },
  {
    name: 'ops/distribution-authorize-skips-link-rights',
    behaviour: 'the share-link operations require Update (and, to issue, Create) on Form Distributions — the bar the claims resolver held',
    file: 'packages/CoreEntitiesServer/src/operations/form-authoring-authorization.ts',
    find: '    const refusal = entityRightRefusal(FORMS_ENTITY.FormDistribution, right, user, metadata);\n    if (refusal) {',
    replace: '    const refusal = entityRightRefusal(FORMS_ENTITY.FormDistribution, right, user, metadata);\n    if (false && refusal) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: [
      'src/operations/__tests__/form-authoring-authorization.spec.ts',
      'src/operations/__tests__/DistributionServerOperations.spec.ts',
    ],
  },
  {
    name: 'designer/side-effects-admitted',
    behaviour: 'the Designer LLM can never author automations / onSubmitMode: its reply is refused (#303 security)',
    file: 'packages/Entities/src/contracts/form-blueprint.ts',
    find: '  return DESIGNER_SIDE_EFFECT_KEYS.filter((key) => key in raw);',
    replace: '  return DESIGNER_SIDE_EFFECT_KEYS.filter(() => false);',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/form-blueprint.spec.ts'],
  },
  {
    name: 'designer/design-spread-into-blueprint',
    behaviour: 'only the caller supplies on-submit side effects: the model design is copied field by field',
    file: 'packages/Actions/src/custom/authoring/on-submit-config.ts',
    find: '  const content: FormBlueprint = { name: design.name, pages: design.pages };',
    replace: '  const content: FormBlueprint = { ...(design as FormBlueprint) };',
    suite: 'packages/Actions',
    killedBy: ['src/custom/authoring/on-submit-config.spec.ts'],
  },
  {
    name: 'actions/authoring-skips-authorization',
    behaviour: 'the authoring Actions refuse anonymous / magic-link sessions and authors without Update on Forms, before the Designer runs',
    file: 'packages/Actions/src/custom/authoring/persist-blueprint.ts',
    find: '  if (refusal) {',
    replace: '  if (false && refusal) {',
    suite: 'packages/Actions',
    killedBy: ['src/custom/authoring/__tests__/authoring-actions.spec.ts'],
  },
  // --- the share-link verbs are operations (#303): "open" as both halves and forced are the
  // server's now, guarded by `engine/open-drops-isactive` and `engine/open-not-forced` below. The old
  // client mutant "reissue clears the invite id" has no server counterpart worth having:
  // `FormDistributionEntityServer` puts a client-written `MagicLinkInviteID` back from its stored
  // value, so clearing it in the engine is a no-op (tried: the mutant survived).
  // --- distribution-manager: the credential writes reload, and the fix button does something --
  {
    name: 'component/credential-write-no-reload',
    behaviour: 'runCredentialWrite re-reads the record after the write',
    file: 'packages/Angular/src/lib/builder/distribution-manager.component.ts',
    find: '    await this.run(write);\n    await this.reload(true);',
    replace: '    await this.run(write);',
    suite: 'packages/Angular',
    killedBy: [
      'src/lib/builder/distribution-manager.behaviour.spec.ts',
      'src/lib/builder/distribution-manager.spec.ts',
    ],
  },
  {
    name: 'component/paused-fix-noop',
    behaviour: "applyFix's 'paused' branch actually reopens the link",
    file: 'packages/Angular/src/lib/builder/distribution-manager.component.ts',
    find: "      case 'paused':\n        // Warns for the same reason `pending` does: reopening asks the server to mint, and the\n        // hook is fail-soft, so \"turned it back on and got no web address\" is a real outcome the\n        // author would otherwise have to notice from the badge alone.\n        await this.runCredentialWrite(() => this.service.open(link));\n        this.warnIfStillUnissued(link.ID, 'issue');\n        return;",
    replace: "      case 'paused':\n        return;",
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/distribution-manager.behaviour.spec.ts'],
  },
  {
    name: 'component/warn-clobbers-save-error',
    behaviour: 'a real save error is not overwritten by the "still unissued" diagnosis',
    file: 'packages/Angular/src/lib/builder/distribution-manager.component.ts',
    find: "  private warnIfStillUnissued(linkId: string, wrote: 'issue' | 'reissue'): void {\n    if (this.actionError !== null) {",
    replace: "  private warnIfStillUnissued(linkId: string, wrote: 'issue' | 'reissue'): void {\n    if (false) {",
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/distribution-manager.behaviour.spec.ts'],
  },
  // --- FormSubmissionEngine: a bucket needs a caller, and a knockout row needs its screen ------
  {
    name: 'pipeline/session-gate-charged-to-blank-callers',
    behaviour: 'the per-session gate is charged only where a session identifies someone, so every header-less caller does not share the tightest bucket',
    file: 'packages/CoreEntitiesServer/src/submission/save-gates.ts',
    find: '  if (sessionIdentity(ctx.sessionId) || !identity) {',
    replace: '  if (true) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/submission/save-response.spec.ts'],
  },
  {
    name: 'pipeline/disqualifying-screen-not-recorded',
    behaviour: 'a Disqualified row records WHICH screen screened the respondent out',
    file: 'packages/CoreEntitiesServer/src/engines/FormSubmissionEngine.ts',
    find: '              disqualifiedByScreenId: plan.knockout?.id,',
    replace: '              disqualifiedByScreenId: undefined,',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/submission/disqualification-gates.spec.ts'],
  },
  // --- FormSubmissionEngine (#303 Task 8): the respondent path's new guards ------------------
  {
    name: 'respondent/foreign-link-session-admitted',
    behaviour: "a magic-link session scoped to one link cannot read or write another link's form",
    file: 'packages/CoreEntitiesServer/src/operations/respondent-authorization.ts',
    find: "  return `the session is scoped to ${scope}, which is neither link '${linkSlug}' nor a response of it`;",
    replace: '  return null;',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/operations/__tests__/RespondentServerOperations.spec.ts'],
  },
  {
    name: 'respondent/unpublished-form-served',
    behaviour: 'a form whose own Status is not Published is neither served nor accepts saves',
    file: 'packages/CoreEntitiesServer/src/submission/published-link.ts',
    find: "  return result.Results[0]?.Status === 'Published' ? 'published' : 'not-published';",
    replace: "  return 'published';",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormSubmissionEngine.spec.ts', 'src/submission/__tests__/published-link.window.spec.ts'],
  },
  {
    name: 'respondent/quota-update-ignored',
    behaviour: 'the conditional UPDATE decides the quota: zero rows refuses the save and rolls it back',
    file: 'packages/CoreEntitiesServer/src/engines/FormSubmissionEngine.ts',
    find: '        if (persisted.completedNow && !(await consumeDistributionSlot(gate.provider, resolved.distribution.ID, gate.system))) {',
    replace: '        if (persisted.completedNow && !(await consumeDistributionSlot(gate.provider, resolved.distribution.ID, gate.system)) && false) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormSubmissionEngine.spec.ts'],
  },
  {
    name: 'respondent/draft-promotion-unlocked',
    behaviour: 'promoting a draft takes its row lock before judging it, so two concurrent finals cannot both seal it and both take a slot',
    file: 'packages/CoreEntitiesServer/src/submission/persistence.ts',
    find: '): Promise<SaveResponseResult> {\n  await lockResponseRow(provider, existingResponseId, contextUser);\n',
    replace: '): Promise<SaveResponseResult> {\n',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/submission/__tests__/terminal-row-guard.spec.ts'],
  },
  {
    name: 'respondent/mistyped-answer-column-admitted',
    behaviour: 'every answer column must carry the type it stores; an object TextValue or a string BooleanValue is refused at the wire',
    file: 'packages/CoreEntitiesServer/src/operations/respondent-request.ts',
    find: '    if (value !== undefined && value !== null && !rule.accepts(value)) {',
    replace: '    if (false) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/operations/__tests__/RespondentServerOperations.spec.ts'],
  },
  {
    name: 'door/unpublished-form-redeemed',
    behaviour: 'the /f/:slug door refuses a form that is not Published exactly as a closed link',
    file: 'packages/Server/src/respondent-host/redeem.service.ts',
    find: "  if (publication === 'not-published') {",
    replace: '  if (false) {',
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/redeem.service.spec.ts'],
  },
  {
    name: 'answers/unbounded-nesting-admitted',
    behaviour: 'an answer nested deeper than MAX_ANSWER_JSON_DEPTH is refused by an iterative scan, before any recursive reader can overflow on it',
    file: 'packages/Entities/src/contracts/answer-shape.ts',
    find: '    if (depth > MAX_ANSWER_JSON_DEPTH) {',
    replace: '    if (false) {',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-shape.spec.ts'],
  },
  {
    name: 'answers/wrong-column-for-type-admitted',
    behaviour: "an answer may fill only the column its question's type stores (a ShortText cannot be answered in the JSON column)",
    file: 'packages/Entities/src/contracts/answer-shape.ts',
    find: "  if (column !== stores && !(stores === 'numeric' && column === 'text')) {",
    replace: '  if (false) {',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-shape.spec.ts'],
  },
  {
    name: 'answers/decimal-scale-unchecked',
    behaviour: 'a number with more decimal places than decimal(18,4) keeps is refused, never silently rounded',
    file: 'packages/Entities/src/contracts/answer-shape.ts',
    find: '  return Number(value.toFixed(DECIMAL_ANSWER_SCALE)) === value ? undefined : `Use at most ${DECIMAL_ANSWER_SCALE} decimal places.`;',
    replace: '  return undefined;',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-shape.spec.ts'],
  },
  {
    name: 'respondent/malformed-payload-reaches-the-verdict',
    behaviour: 'a payload the structure pre-scan refuses is refused right after the rate limit is charged — never handed to a recursive reader',
    file: 'packages/CoreEntitiesServer/src/engines/FormSubmissionEngine.ts',
    find: '    if (malformed.length > 0) {\n      return report(',
    replace: '    if (false) {\n      return report(',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormSubmissionEngine.spec.ts'],
  },
  {
    name: 'work-queue/unreconciled-host-judged',
    behaviour: 'a work-queue host that has started but not yet loaded its subscription states is waited for, not reported as misconfigured',
    file: 'packages/CoreEntitiesServer/src/work-queue/forms-work-queue.ts',
    find: '      if (host.GetHealth().Subscriptions.length > 0) {',
    replace: '      if (true) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/work-queue/__tests__/forms-work-queue.spec.ts'],
  },
  {
    name: 'answers/impossible-date-rolled-over',
    behaviour: 'an impossible calendar date (2026-02-30) is refused, never stored as the day V8 rolls it over to',
    file: 'packages/Entities/src/contracts/answer-date.ts',
    find: '  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {',
    replace: '  if (false) {',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-date.spec.ts'],
  },
  {
    name: 'answers/decimal-bound-inclusive',
    behaviour: 'the decimal(18,4) bound is exclusive at 1e14 (99999999999999.9999 rounds to 1e14 as a double)',
    file: 'packages/Entities/src/contracts/answer-shape.ts',
    find: 'Math.abs(value) >= DECIMAL_ANSWER_LIMIT',
    replace: 'Math.abs(value) > DECIMAL_ANSWER_LIMIT',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-shape.spec.ts'],
  },
  {
    name: 'answers/per-field-numeric-storage-skipped',
    behaviour: "the widget's per-field verdict refuses a number the server cannot store, so the two sides never disagree",
    file: 'packages/Entities/src/contracts/answer-validation.ts',
    find: "  if (typeof value === 'number' && answerColumnFor(question.type) === 'numeric') {",
    replace: '  if (false) {',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-validation.spec.ts'],
  },
  {
    name: 'answers/date-outside-datetimeoffset',
    behaviour: 'a date DATETIMEOFFSET cannot store (outside 0001-01-01..9999-12-31 once its offset is applied) is refused',
    file: 'packages/Entities/src/contracts/answer-date.ts',
    find: '  return time < FIRST_STORABLE_INSTANT || time > LAST_STORABLE_INSTANT ? undefined : instant;',
    replace: '  return instant;',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-date.spec.ts'],
  },
  {
    name: 'widget/unstorable-field-in-autosave',
    behaviour: 'an autosave leaves out a field the server cannot store, so one bad field never gets the whole draft refused',
    file: 'packages/Angular/src/lib/widget/core/form-runtime.ts',
    find: "      .filter((question) => validateAnswer(question, transmittedValue(question, this.valueFor(question.id)), 'draft') !== undefined)",
    replace: '      .filter((question) => question === undefined)',
    suite: 'packages/Angular',
    killedBy: ['src/lib/widget/core/form-runtime.spec.ts'],
  },
  {
    name: 'widget/autosave-trimmed-past-a-rule',
    behaviour: 'an autosave is held, never trimmed, when a rule may read the field it would leave out (a trimmed draft hides dependants and trips knockouts)',
    file: 'packages/Angular/src/lib/widget/core/form-runtime.ts',
    find: '    if (rulesMayRead(this.definition, unstorable)) {',
    replace: '    if (false) {',
    suite: 'packages/Angular',
    killedBy: ['src/lib/widget/core/form-runtime.spec.ts'],
  },
  {
    name: 'answers/projection-vouches-for-fields',
    behaviour: 'the respondent projection, stripped of knockout/score/automation rules, never counts as proof that no rule reads a field',
    file: 'packages/Entities/src/contracts/rule-sources.ts',
    find: '  if (definition.endScreens === undefined) {\n    return true;',
    replace: '  if (false) {\n    return true;',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/rule-sources.spec.ts'],
  },
  {
    name: 'answers/scored-field-not-a-rule-source',
    behaviour: 'a scored field counts as read by every score condition, since leaving it out lowers the total',
    file: 'packages/Entities/src/contracts/rule-sources.ts',
    find: "    conditions.some((condition) => condition.source === 'score') &&",
    replace: '    false &&',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/rule-sources.spec.ts'],
  },
  {
    name: 'answers/two-digit-year-read-as-1900s',
    behaviour: 'a year 0001-0099 date is stored as the year typed, never as 19xx (Date.UTC and the legacy parser both do that)',
    file: 'packages/Entities/src/contracts/answer-date.ts',
    find: '  instant.setUTCFullYear(parts.year, parts.month - 1, parts.day);',
    replace: '  instant.setTime(Date.UTC(parts.year, parts.month - 1, parts.day));',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-date.spec.ts'],
  },
  {
    name: 'answers/date-offset-ignored',
    behaviour: "a date-time's offset moves the stored instant (10:00+02:00 is 08:00Z)",
    file: 'packages/Entities/src/contracts/answer-date.ts',
    find: '  return new Date(instant.getTime() - parts.offsetMinutes * 60_000);',
    replace: '  return new Date(instant.getTime());',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-date.spec.ts'],
  },
  {
    name: 'answers/offset-past-fourteen-hours',
    behaviour: 'an offset past the real ±14:00 limit (+14:59) is refused',
    file: 'packages/Entities/src/contracts/answer-date.ts',
    find: '  if (minutes > 59 || magnitude > MAX_OFFSET_MINUTES) {',
    replace: '  if (minutes > 59 || hours > 14) {',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-date.spec.ts'],
  },
  {
    name: 'answers/zoneless-date-time-admitted',
    behaviour: 'a date-time with no offset is refused in every mode, never stored at a host-time-zone-dependent instant',
    file: 'packages/Entities/src/contracts/answer-date.ts',
    find: '  if (hasTime && match[ISO_GROUP.offset] === undefined) {',
    replace: '  if (false) {',
    suite: 'packages/Entities',
    killedBy: ['src/contracts/answer-date.spec.ts'],
  },
  {
    name: 'respondent/partial-knockout-not-ended',
    behaviour: 'a partial save whose settled answers trip a knockout is answered ended, with the server-chosen screen',
    file: 'packages/CoreEntitiesServer/src/engines/FormSubmissionEngine.ts',
    find: "    const ended = isTerminalResponseStatus(committed.status) || (partialKnockout !== undefined && committed.status === 'Partial');",
    replace: '    const ended = isTerminalResponseStatus(committed.status);',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/submission/disqualification-gates.spec.ts'],
  },
  // --- design-state: which style row a form's Design tab may write to ----------------------
  {
    name: 'design/shared-rank0-style-edited-in-place',
    behaviour: 'a rank-0 style another form also points at (a template clone) is forked, not restyled for everyone',
    file: 'packages/Angular/src/lib/builder/design-state.service.ts',
    find: '      if (current && current.DisplayRank === 0 && (await this.isUsedOnlyBy(current.ID, form.ID))) {',
    replace: '      if (current && current.DisplayRank === 0) {',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/design-state.service.spec.ts'],
  },
  {
    name: 'design/unreadable-share-check-treated-as-exclusive',
    behaviour: 'a failed "is this style shared?" read forks the style rather than edit a row that may be shared',
    file: 'packages/Angular/src/lib/builder/design-state.service.ts',
    find: "        `form ${formId}; forking it instead: ${result.ErrorMessage}`,\n      );\n      return false;",
    replace: "        `form ${formId}; forking it instead: ${result.ErrorMessage}`,\n      );\n      return true;",
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/design-state.service.spec.ts'],
  },
  {
    name: 'design/style-name-overflows-column',
    behaviour: 'a style name derived from a long form name is shortened to fit FormStyle.Name (NVARCHAR 255)',
    file: 'packages/Angular/src/lib/builder/design-state.service.ts',
    find: '  return `${base.slice(0, STYLE_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`;',
    replace: '  return `${base}${suffix}`;',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/design-state.service.spec.ts'],
  },
  // --- respondent-host: the boot warning for a GRAPHQL_ROOT_PATH Forms cannot address ---------
  {
    name: 'root-path/prefixed-graphql-exempt',
    behaviour: 'a prefixed GraphQL root path such as /api/graphql is warned about, because /forms/* is not under it',
    file: 'packages/Server/src/respondent-host/config.ts',
    find: "  if (bare === '' || /^graphql$/i.test(bare)) {",
    replace: "  if (bare === '' || /(^|\\/)graphql$/i.test(bare)) {",
    suite: 'packages/Server',
    killedBy: ['src/respondent-host/__tests__/config.spec.ts'],
  },
  // --- Person Forms section (#285): what the list loads, when, and which result it keeps ------
  {
    name: 'person-forms/refresh-before-first-load',
    behaviour: "a host-form record refresh is ignored by a list that never loaded (the refresh coordinator's contract)",
    file: 'packages/Angular/src/lib/form-panels/person-form-responses-list.component.ts',
    find: '    if (this.loadSequence > 0) void this.load();',
    replace: '    void this.load();',
    suite: 'packages/Angular',
    killedBy: ['src/lib/form-panels/person-form-responses-list.component.spec.ts'],
  },
  {
    name: 'person-forms/superseded-result-applied',
    behaviour: 'a slow earlier load cannot overwrite the rows a newer load (refresh, Retry, new person) already showed',
    file: 'packages/Angular/src/lib/form-panels/person-form-responses-list.component.ts',
    find: '      if (sequence !== this.loadSequence) return; // superseded: a newer load owns the state',
    replace: '      // superseded check removed',
    suite: 'packages/Angular',
    killedBy: ['src/lib/form-panels/person-form-responses-list.component.spec.ts'],
  },
  {
    name: 'person-forms/superseded-failure-takes-the-screen',
    behaviour: 'a slow earlier load that fails cannot replace a newer successful list with the error state',
    file: 'packages/Angular/src/lib/form-panels/person-form-responses-list.component.ts',
    find: '    if (sequence !== this.loadSequence) return;\n    this.ErrorMessage.set(LOAD_FAILED_MESSAGE);',
    replace: '    this.ErrorMessage.set(LOAD_FAILED_MESSAGE);',
    suite: 'packages/Angular',
    killedBy: ['src/lib/form-panels/person-form-responses-list.component.spec.ts'],
  },
  {
    name: 'person-forms/latch-ignores-expansion',
    behaviour: 'the Forms list is not mounted (and queries nothing) until its section is first expanded',
    file: 'packages/Angular/src/lib/form-panels/person-form-responses.model.ts',
    find: '    if (this.latchedFor === null && isSaved && isExpanded) this.latchedFor = record;',
    replace: '    if (this.latchedFor === null && isSaved) this.latchedFor = record;',
    suite: 'packages/Angular',
    killedBy: ['src/lib/form-panels/person-form-responses.model.spec.ts'],
  },
  {
    name: 'person-forms/latch-mounts-unsaved-record',
    behaviour: 'an unsaved Person never mounts the Forms list, even with the section expanded',
    file: 'packages/Angular/src/lib/form-panels/person-form-responses.model.ts',
    find: '    if (this.latchedFor === null && isSaved && isExpanded) this.latchedFor = record;',
    replace: '    if (this.latchedFor === null && isExpanded) this.latchedFor = record;',
    suite: 'packages/Angular',
    killedBy: ['src/lib/form-panels/person-form-responses.model.spec.ts'],
  },
  {
    name: 'person-forms/latch-survives-record-change',
    behaviour: 'opening a different Person resets the latch, so a collapsed section for them stays lazy',
    file: 'packages/Angular/src/lib/form-panels/person-form-responses.model.ts',
    find: '    if (this.latchedFor !== record) this.latchedFor = null;',
    replace: '    // record-change reset removed',
    suite: 'packages/Angular',
    killedBy: ['src/lib/form-panels/person-form-responses.model.spec.ts'],
  },
  {
    name: 'person-forms/filter-accepts-non-guid',
    behaviour: 'only a GUID person id is interpolated into the RunView filter — anything else is refused, not queried',
    file: 'packages/Angular/src/lib/form-panels/person-form-responses.model.ts',
    find: '  if (!GUID.test(personId)) {',
    replace: '  if (personId.length < 0) {',
    suite: 'packages/Angular',
    killedBy: ['src/lib/form-panels/person-form-responses.model.spec.ts'],
  },
  // --- #291: the asset byte cache and the welcome gate ---------------------------------------
  {
    name: 'asset-cache/key-ignores-where-the-row-points',
    behaviour: 'kept bytes are found only under the id AND the provider and key the row names now',
    file: 'packages/Server/src/asset/asset.service.ts',
    find: '  return `${fileId.toUpperCase()}|${providerId.toUpperCase()}|${providerKey}`;',
    replace: '  return `${fileId.toUpperCase()}`;',
    suite: 'packages/Server',
    killedBy: ['src/asset/__tests__/asset.service.spec.ts'],
  },
  {
    name: 'asset-cache/no-single-flight',
    behaviour: 'concurrent first requests for one asset share one storage read',
    file: 'packages/Server/src/asset/asset-byte-cache.ts',
    find: '    if (pending) return pending;',
    replace: '    if (false && pending) return pending;',
    suite: 'packages/Server',
    killedBy: ['src/asset/__tests__/asset-byte-cache.spec.ts', 'src/asset/__tests__/asset.service.spec.ts'],
  },
  {
    name: 'welcome-gate/stale-load-reveals',
    behaviour: 'an earlier or destroyed load never reveals the welcome screen',
    file: 'packages/Angular/src/lib/widget/core/welcome-gate.ts',
    find: '    if (--waitingReady === 0 && hooks.isCurrent()) hooks.reveal(failed);',
    replace: '    if (--waitingReady === 0) hooks.reveal(failed);',
    suite: 'packages/Angular',
    killedBy: ['src/lib/widget/core/welcome-gate.spec.ts'],
  },
  {
    name: 'welcome-gate/first-image-reveals',
    behaviour: 'the welcome screen waits for the LAST of its images, not the first',
    file: 'packages/Angular/src/lib/widget/core/welcome-gate.ts',
    find: '    if (--waitingReady === 0 && hooks.isCurrent()) hooks.reveal(failed);',
    replace: '    if (--waitingReady >= 0 && hooks.isCurrent()) hooks.reveal(failed);',
    suite: 'packages/Angular',
    killedBy: ['src/lib/widget/core/welcome-gate.spec.ts'],
  },
  {
    name: 'welcome-gate/failure-not-reported',
    behaviour: 'the reveal names the images the gate saw fail',
    file: 'packages/Angular/src/lib/widget/core/welcome-gate.ts',
    find: "      if (outcome === 'failed') failed.add(url);",
    replace: '      void outcome;',
    suite: 'packages/Angular',
    killedBy: ['src/lib/widget/core/welcome-gate.spec.ts'],
  },
  {
    name: 'welcome-gate/known-broken-logo-rendered',
    behaviour: 'a logo the gate saw fail is marked broken before the reveal, not rendered and dropped',
    file: 'packages/Angular/src/lib/widget/mj-form.component.ts',
    find: '        if (logo && failed.has(logo) && this.logoUrl() === logo) this.logoBroken.set(true);',
    replace: '        void failed;',
    suite: 'packages/Angular',
    killedBy: ['src/lib/widget/image-prefetch.wiring.spec.ts'],
  },
  // --- FormReportingEngine (#303 Task 9): response reporting's privacy and paging guards -----
  {
    name: "reporting/headline-counts-every-status",
    behaviour: "the headline counts Complete responses only; a Partial autosave is not a response",
    file: "packages/CoreEntitiesServer/src/reporting/headline.ts",
    find: "    TotalResponses: row.CompleteCount,",
    replace: "    TotalResponses: row.StartedCount,",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/operations/__tests__/ReportingServerOperations.spec.ts", "src/reporting/__tests__/FormReportingEngine.parity.spec.ts", "src/reporting/__tests__/FormReportingEngine.spec.ts", "src/reporting/__tests__/headline-and-funnel.spec.ts"],
  },
  {
    name: "reporting/nps-scores-off-scale-ratings",
    behaviour: "NPS is scored over ratings 0..10 only; a stored 99 must not make a promoter",
    file: "packages/CoreEntitiesServer/src/reporting/breakdowns.ts",
    find: "      if (rating < NPS_MIN || rating > NPS_MAX) {",
    replace: "      if (rating < NPS_MIN && rating > NPS_MAX) {",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/reporting/__tests__/FormReportingEngine.parity.spec.ts", "src/reporting/__tests__/breakdowns.spec.ts"],
  },
  {
    name: "reporting/off-list-choice-shipped-as-its-text",
    behaviour: "a choice value outside the options is counted as Other, never returned under its own text",
    file: "packages/CoreEntitiesServer/src/reporting/breakdowns.ts",
    find: "      offList += row.ValueCount;",
    replace: "      counts.set(row.Value, row.ValueCount);\n      options = [...options, { id: row.Value, label: row.Value, value: row.Value, displayOrder: 0 }];",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/reporting/__tests__/FormReportingEngine.parity.spec.ts", "src/reporting/__tests__/breakdowns.spec.ts"],
  },
  {
    name: "reporting/matrix-off-list-cell-shipped-as-its-text",
    behaviour: "a Matrix row or column the author never offered is counted as Other, never returned as text",
    file: "packages/CoreEntitiesServer/src/reporting/breakdowns.ts",
    find: "        const key = cellKey(rowValues.has(row) ? row : OFF_LIST_LABEL, columnValues.has(cell) ? cell : OFF_LIST_LABEL);",
    replace: "        const key = cellKey(row, cell);\n        if (!rowValues.has(row)) rows.push({ id: row, label: row, value: row, displayOrder: 0 });\n        if (!columnValues.has(cell)) columns.push({ id: cell, label: cell, value: cell, displayOrder: 0 });",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/reporting/__tests__/breakdowns.spec.ts"],
  },
  {
    name: "reporting/funnel-keeps-pages-that-ask-nothing",
    behaviour: "a page with no answerable question is not a funnel step (a welcome page zeroed every retention)",
    file: "packages/CoreEntitiesServer/src/reporting/funnel.ts",
    find: "    .some((type) => isFormQuestionType(type) && isAnswerableQuestionType(type));",
    replace: "    .some((type) => isFormQuestionType(type));",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/reporting/__tests__/FormReportingEngine.parity.spec.ts", "src/reporting/__tests__/headline-and-funnel.spec.ts"],
  },
  {
    name: "reporting/themes-mined-from-short-text",
    behaviour: "themes are mined from LongText only, so names typed into a ShortText never become terms",
    file: "packages/CoreEntitiesServer/src/reporting/open-text.ts",
    find: "      const themesApply = question.type === 'LongText';",
    replace: "      const themesApply = question.type === 'LongText' || question.type === 'ShortText';",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/reporting/__tests__/FormReportingEngine.parity.spec.ts", "src/reporting/__tests__/profile-and-open-text.spec.ts"],
  },
  {
    name: "reporting/summary-queries-run-as-the-caller",
    behaviour: "the summary's queries run as the system user, which holds their run permissions",
    file: "packages/CoreEntitiesServer/src/engines/FormReportingEngine.ts",
    find: "        const system = systemUserFor(seams);",
    replace: "        const system = user;",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/operations/__tests__/ReportingServerOperations.spec.ts", "src/reporting/__tests__/FormReportingEngine.spec.ts"],
  },
  {
    name: "reporting/list-page-unbounded",
    behaviour: "a response page is lowered to the server's page size, never read unbounded",
    file: "packages/CoreEntitiesServer/src/engines/FormReportingEngine.ts",
    find: "    maxRows: Math.min(request.maxRows, MAX_RESPONSE_PAGE_SIZE),",
    replace: "    maxRows: request.maxRows,",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/reporting/__tests__/FormReportingEngine.spec.ts"],
  },
  {
    name: "reporting/list-order-without-id-tiebreak",
    behaviour: "list order ends on ID, so paging an export never repeats or skips tied rows",
    file: "packages/CoreEntitiesServer/src/engines/FormReportingEngine.ts",
    find: "  'SubmittedAt DESC': 'SubmittedAt DESC, ID',",
    replace: "  'SubmittedAt DESC': 'SubmittedAt DESC',",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/reporting/__tests__/FormReportingEngine.spec.ts"],
  },
  {
    name: "reporting/detail-labels-from-another-form",
    behaviour: "a response's answers are labelled only by a version of its own form",
    file: "packages/CoreEntitiesServer/src/engines/FormReportingEngine.ts",
    find: "  if (!version || !UUIDsEqual(version.FormID, response.FormID)) {",
    replace: "  if (!version) {",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/reporting/__tests__/FormReportingEngine.spec.ts"],
  },
  {
    name: "reporting/insight-cap-unreported",
    behaviour: "when the answer-row read stops at its cap, the summary says so instead of presenting a sample as the whole",
    file: "packages/CoreEntitiesServer/src/reporting/insight-answers.ts",
    find: "  return { rows, capped: rows.length < total };",
    replace: "  return { rows, capped: false };",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/reporting/__tests__/insight-answers.spec.ts"],
  },
  {
    name: "reporting/reading-rule-admits-magic-link",
    behaviour: "a respondent's magic-link session can never read a form's responses",
    file: "packages/CoreEntitiesServer/src/operations/form-authoring-authorization.ts",
    find: "  const session = sessionRefusal(user, \"read a form's responses\");",
    replace: "  const session = user ? null : sessionRefusal(user, \"read a form's responses\");",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/operations/__tests__/ReportingServerOperations.spec.ts", "src/operations/__tests__/form-authoring-authorization.spec.ts"],
  },
  {
    name: "reporting/reading-rule-skips-entity-reads",
    behaviour: "reading responses needs Read on the form, its versions, its responses and their answers",
    file: "packages/CoreEntitiesServer/src/operations/form-authoring-authorization.ts",
    find: "    const refusal = entityRightRefusal(entityName, 'CanRead', user, metadata);",
    replace: "    const refusal = entityName ? null : entityRightRefusal(entityName, 'CanRead', user, metadata);",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/operations/__tests__/ReportingServerOperations.spec.ts", "src/operations/__tests__/form-authoring-authorization.spec.ts"],
  },
  {
    name: "reporting/summary-elevates-for-a-row-filtered-caller",
    behaviour: "a caller whose reads of responses or answers are row-filtered gets no summary computed as the system user",
    file: "packages/CoreEntitiesServer/src/operations/form-authoring-authorization.ts",
    find: "      if (entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '').trim() !== '') {",
    replace: "      if (entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '').trim() === 'never') {",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/reporting/__tests__/FormReportingEngine.spec.ts", "src/operations/__tests__/ReportingServerOperations.spec.ts", "src/operations/__tests__/form-authoring-authorization.spec.ts"],
  },
  {
    name: "reporting/engine-skips-its-elevation-gate",
    behaviour: "the engine applies the reading rule and the row-filter check itself, so an in-process caller cannot skip them",
    file: "packages/CoreEntitiesServer/src/engines/FormReportingEngine.ts",
    find: "        refuseElevationFor(user, provider);",
    replace: "        void refuseElevationFor;",
    suite: 'packages/CoreEntitiesServer',
    killedBy: ["src/operations/__tests__/ReportingServerOperations.spec.ts", "src/reporting/__tests__/FormReportingEngine.spec.ts"],
  },
  // --- the builder's structural writes (#303 Task 10a) -------------------------------------------
  {
    name: 'builder/autosave-races-structural-save',
    behaviour: 'a field autosave waits for a structural graph save in flight, so its pre-edit DisplayOrder cannot undo it',
    file: 'packages/Angular/src/lib/builder/builder-state.service.ts',
    find: '      .then(() => this.structuralInFlight ?? undefined)\n',
    replace: '',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/builder-state.structure.spec.ts'],
  },
  {
    name: 'builder/field-save-ships-a-graph',
    behaviour: "a field autosave is one row's save; its loaded collections never ride along as a graph",
    file: 'packages/Angular/src/lib/builder/builder-state.service.ts',
    find: '    options.SkipRelatedCollections = true;',
    replace: '    options.SkipRelatedCollections = false;',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/builder-state.structure.spec.ts'],
  },
  {
    name: 'builder/refused-reorder-left-on-screen',
    behaviour: 'a refused in-section reorder puts the question back, since nothing was written',
    file: 'packages/Angular/src/lib/builder/form-builder.component.ts',
    find: '        moveItemInArray(page.questions, to, from);\n',
    replace: '',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/form-builder.verbs.spec.ts'],
  },
  {
    name: 'builder/publish-leaves-stale-status',
    behaviour: "after a publish the open record takes the server's Status back, so its next save does not send Draft",
    file: 'packages/Angular/src/lib/builder/form-builder.component.ts',
    find: '      if (!(await this.refreshFormRecord())) {',
    replace: '      if (!(await Promise.resolve(true))) {',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/form-builder.verbs.spec.ts'],
  },
  {
    name: 'builder/style-save-ships-a-graph',
    behaviour: "applying a style saves the form row alone; the form's loaded pages and screens never ride along",
    file: 'packages/Angular/src/lib/builder/design-state.service.ts',
    find: '    options.SkipRelatedCollections = true;',
    replace: '    options.SkipRelatedCollections = false;',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/design-state.service.spec.ts'],
  },
  {
    name: 'builder/direct-save-skips-the-queue',
    behaviour: 'a direct field save (name, title, toggle) goes through the one save queue: flushed before publish, held during a structural save',
    file: 'packages/Angular/src/lib/builder/builder-state.service.ts',
    find: "    return this.chainSave(entity, 'save');",
    replace: "    return this.saveChecked(entity, 'save');",
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/builder-state.structure.spec.ts'],
  },
  {
    name: 'builder/added-option-left-to-the-caller',
    behaviour: 'the service puts a saved option into the question when its save runs, so a queued delete cannot drop it from the screen',
    file: 'packages/Angular/src/lib/builder/builder-state.service.ts',
    find: '      node.options.push(option);\n',
    replace: '',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/builder-state.structure.spec.ts'],
  },
  {
    name: 'builder/publish-refusal-assumed-about-rules',
    behaviour: "a publish refusal is retracted on a rule fix only when the server's reason IS the broken-rule refusal",
    file: 'packages/Angular/src/lib/builder/form-builder.component.ts',
    find: '      this.refusedRules = broken.length > 0 && outcome.error === brokenRuleRefusal(broken) ? broken : null;',
    replace: '      this.refusedRules = broken.length > 0 ? broken : null;',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/form-builder.verbs.spec.ts'],
  },
  {
    name: 'builder/record-misses-operation-writes',
    behaviour: "the open record adopts the form row after an operation writes it, so a field save cannot send stale Settings or Status back",
    file: 'packages/Angular/src/lib/builder/form-builder.component.ts',
    find: '    this.watchForFormOperations();\n',
    replace: '',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/form-builder.verbs.spec.ts'],
  },
  {
    name: 'engine/delete-template-deletes-a-form',
    behaviour: 'DeleteTemplate refuses a working form; only a template is ever deleted',
    file: 'packages/CoreEntitiesServer/src/engines/FormAuthoringEngine.ts',
    find: '      if (!form.IsTemplate) {',
    replace: '      if (false) {',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAuthoringEngine.delete-template.spec.ts'],
  },
  {
    name: 'engine/delete-template-ignores-attached',
    behaviour: 'DeleteTemplate refuses a template with responses, versions or share links before deleting anything',
    file: 'packages/CoreEntitiesServer/src/engines/FormAuthoringEngine.ts',
    find: '      await refuseAttachedRecords(form.ID, provider, user);\n',
    replace: '',
    suite: 'packages/CoreEntitiesServer',
    killedBy: ['src/engines/__tests__/FormAuthoringEngine.delete-template.spec.ts'],
  },
  {
    name: 'builder/template-delete-announced-as-a-save',
    behaviour: "the gallery's Forms.DeleteTemplate is announced as a DELETE, so an open builder's 'Saved as template' indicator clears",
    file: 'packages/Angular/src/lib/templates/templates-gallery.component.ts',
    find: "        'delete',\n      );",
    replace: '      );',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/form-builder.verbs.spec.ts'],
  },
  {
    name: 'builder/design-panel-saves-outside-the-queue',
    behaviour: "the Design panel uses the builder's DesignStateService (the queued one), not one of its own",
    file: 'packages/Angular/src/lib/builder/design-panel.component.ts',
    find: '  providers: [],',
    replace: '  providers: [DesignStateService],',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/design-queue.spec.ts'],
  },
  {
    name: 'builder/publish-rereads-the-record-twice',
    behaviour: "the builder skips re-reading for its own operations' announcements; publish re-reads once, itself",
    file: 'packages/Angular/src/lib/builder/form-builder.component.ts',
    find: '        if (this.ownOperations === 0) {',
    replace: '        if (true) {',
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/form-builder.verbs.spec.ts'],
  },
  {
    name: 'shared/operation-write-not-announced',
    behaviour: 'a successful operation announces the entities it wrote, so the builder header, home grid and gallery re-read',
    file: 'packages/Angular/src/lib/shared/remote-operation.ts',
    find: '    announceWrites(writes, writeKind);\n',
    replace: '',
    suite: 'packages/Angular',
    killedBy: ['src/lib/shared/remote-operation.spec.ts'],
  },
  {
    name: 'home/template-notes-wiped-by-reload',
    behaviour: "a saved template's copy notes are shown after the grid reload, whose start clears the alert",
    file: 'packages/Angular/src/lib/home/forms-home-dashboard.component.ts',
    find: "      if (outcome.output.Warnings.length > 0) {\n        this.errorMessage = outcome.output.Warnings.join(' ');\n      }",
    replace: '',
    suite: 'packages/Angular',
    killedBy: ['src/lib/home/forms-home-dashboard.component.spec.ts'],
  },
];

/**
 * The spec files one suite's mutants are judged by, deduplicated — which is also exactly the set
 * its baseline must prove green. A test no mutant ever runs cannot turn a SURVIVED into a KILLED,
 * so it has no place in the measurement either way.
 */
export function killFilesFor(mutants, suite) {
  return [...new Set(mutants.filter((m) => m.suite === suite).flatMap((m) => m.killedBy))].sort();
}

/** Apply `entry` to its file, run its suite, restore. Returns one of the four verdicts. */
export function runMutant(entry, { repoRoot = REPO_ROOT, run = runSuite } = {}) {
  if (!Array.isArray(entry.killedBy) || entry.killedBy.length === 0) {
    // Not a fallback to the whole suite: that is the slow behaviour this field exists to remove,
    // and it would come back silently on the one entry that forgot it.
    throw new Error(`${entry.name}: killedBy must name at least one spec file that kills this mutant`);
  }
  const path = join(repoRoot, entry.file);
  const original = readFileSync(path, 'utf-8');
  const occurrences = original.split(entry.find).length - 1;
  if (occurrences !== 1) {
    return { verdict: 'NOT APPLIED', detail: `find matched ${occurrences} times` };
  }
  writeFileSync(path, original.replace(entry.find, entry.replace));
  try {
    const result = run(join(repoRoot, entry.suite), entry.killedBy);
    if (result.crashed) return { verdict: 'CRASHED', detail: result.detail };
    return result.failed > 0
      ? { verdict: 'KILLED', detail: `${result.failed} failing` }
      : { verdict: 'SURVIVED', detail: `${result.passed} passing, 0 failing` };
  } finally {
    writeFileSync(path, original);
  }
}

/** ANSI SGR escapes — vitest colours its summary wherever it thinks it has a terminal. */
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * Read vitest's `Tests  N failed | M passed` line out of a run's combined output. Anything
 * without one is a CRASH — never a kill.
 *
 * Colour is stripped first. The first CI run of this gate reported BASELINE FAILED on a green
 * suite: GitHub Actions enables colour, so the summary arrived as
 * `\x1b[2m Tests \x1b[22m\x1b[1m\x1b[32m73 passed…` and a plain-text regex could not see it, while
 * a local `spawnSync` has no TTY and never showed the problem. The gate failed loud rather than
 * passing false — the designed direction — but a gate that cannot run in CI protects nothing.
 */
export function parseSuiteSummary(out) {
  const plain = out.replace(ANSI, '');
  const summary = plain.match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed/);
  if (!summary) return { crashed: true, detail: plain.slice(-400) };
  return { crashed: false, failed: Number(summary[1] ?? 0), passed: Number(summary[2]) };
}

/**
 * Run the named spec files of a package's vitest suite and read its summary line.
 *
 * `files` is not an optimisation bolted onto a full-suite runner — it IS the instrument. Vitest's
 * per-file cost here is collection, not assertion: packages/Server spends ~90s collecting its 78
 * spec files and 800ms running the 996 tests inside them. Handing it the one or two files that can
 * observe the mutated source turns a 37.5s CI run into a ~4s one, and running fewer tests can only
 * ever turn a KILLED into a SURVIVED — never the reverse — so the gate can only get stricter.
 *
 * A `files` entry matching no test file is not silent: vitest exits 1 with "No test files found"
 * and no summary line, which `parseSuiteSummary` reports as CRASHED.
 */
function runSuite(cwd, files) {
  const res = spawnSync('npx', ['vitest', 'run', '--reporter=default', ...files], {
    cwd,
    encoding: 'utf-8',
    timeout: SUITE_TIMEOUT_MS,
    // NO_COLOR asks vitest not to colour at all; the parser strips colour anyway. Both, because
    // the failure mode is a gate that silently cannot run.
    env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  if (res.error) return { crashed: true, detail: res.error.message };
  return parseSuiteSummary(`${res.stdout ?? ''}\n${res.stderr ?? ''}`);
}

function main() {
  const suites = [...new Set(MUTANTS.map((m) => m.suite))];
  for (const suite of suites) {
    const baseline = runSuite(join(REPO_ROOT, suite), killFilesFor(MUTANTS, suite));
    if (baseline.crashed || baseline.failed > 0) {
      console.error(`BASELINE FAILED for ${suite}: ${baseline.detail ?? `${baseline.failed} failing`} — nothing measured.`);
      process.exit(2);
    }
    console.log(`baseline ${suite}: ${baseline.passed} passing`);
  }
  let bad = 0;
  let stale = 0;
  for (const entry of MUTANTS) {
    const { verdict, detail } = runMutant(entry);
    const ok = verdict === 'KILLED';
    if (!ok) bad++;
    if (verdict === 'NOT APPLIED') stale++;
    console.log(`${ok ? '✓' : '✗'} ${entry.name.padEnd(44)} ${verdict.padEnd(12)} ${detail}`);
    if (!ok) console.log(`      lost: ${entry.behaviour}`);
  }
  if (bad > 0) {
    // The two failures want OPPOSITE fixes, and reporting only one sends the reader the wrong way.
    // SURVIVED means the guard has no behavioural test — write one. NOT APPLIED means a refactor
    // moved the code the anchor points at, so the mutant proved nothing; the guard itself may be
    // perfectly well tested. A refactor produces the second and never the first, which is exactly
    // when someone is least expecting this gate to be the thing that failed.
    if (stale > 0) {
      console.error(
        `\n❌ ${stale} mutant(s) NOT APPLIED — the anchor no longer matches the source. Re-point ` +
          "`find` at the guard's current text; an unapplied mutant proves nothing.",
      );
    }
    if (bad > stale) {
      console.error(
        `\n❌ ${bad - stale} guard(s) can be neutralised with their named spec green. ` +
          'Write the behavioural test each entry names.',
      );
    }
    process.exit(1);
  }
  console.log(`\n✅ Guard-mutation check passed — all ${MUTANTS.length} load-bearing guards are killed by the spec each names.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
