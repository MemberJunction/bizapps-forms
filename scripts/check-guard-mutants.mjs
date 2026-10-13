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
  // --- public-submit: the ONE ownership rule on the anonymous write path --------------------
  {
    name: 'scope/ownership-gate-neutralised',
    behaviour: 'a caller may only act on a response their own session owns, or an unowned one',
    file: 'packages/Server/src/public-submit/persistence.service.ts',
    find: "  if (owner === '' || owner === foldId(caller.sessionId)) {",
    replace: "  if (true || owner === '' || owner === foldId(caller.sessionId)) {",
    suite: 'packages/Server',
    killedBy: [
      'src/public-submit/__tests__/response-scope-ownership.spec.ts',
      'src/public-submit/__tests__/session-ownership.spec.ts',
      'src/respondent-host/__tests__/device-resume.service.spec.ts',
    ],
  },
  {
    name: 'scope/absent-credential-more-permissive-than-a-wrong-one',
    behaviour: 'a MISSING session header is refused exactly as a forged one is — never treated as a match',
    file: 'packages/Server/src/public-submit/persistence.service.ts',
    find: "  if (owner === '' || owner === foldId(caller.sessionId)) {",
    replace: "  if (owner === '' || foldId(caller.sessionId) === '' || owner === foldId(caller.sessionId)) {",
    suite: 'packages/Server',
    killedBy: [
      'src/public-submit/__tests__/response-scope-ownership.spec.ts',
      'src/public-submit/__tests__/session-ownership.spec.ts',
    ],
  },
  {
    name: 'scope/blank-jwt-scope-matches-nothing',
    behaviour: 'a session with no response scope is admitted to no row — an empty claim is not a key',
    file: 'packages/Server/src/public-submit/persistence.service.ts',
    find: "  return scope !== '' && scope === foldId(response.ID);",
    replace: "  return scope === foldId(response.ID);",
    suite: 'packages/Server',
    killedBy: ['src/public-submit/__tests__/response-scope-ownership.spec.ts'],
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
  // --- distribution.service: "open" is both halves, and forced -------------------------------
  {
    name: 'service/open-drops-isactive',
    behaviour: 'openForResponses writes IsActive = true as well as Status',
    file: 'packages/Angular/src/lib/builder/distribution.service.ts',
    find: "    dist.Status = 'Active';\n    dist.IsActive = true;",
    replace: "    dist.Status = 'Active';",
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/distribution.service.behaviour.spec.ts'],
  },
  {
    name: 'service/open-not-forced',
    behaviour: 'openForResponses passes IgnoreDirtyState so a clean record still reaches the hook',
    file: 'packages/Angular/src/lib/builder/distribution.service.ts',
    find: '    options.IgnoreDirtyState = true;\n    return this.saveDist(dist, action, options);',
    replace: '    return this.saveDist(dist, action);',
    suite: 'packages/Angular',
    killedBy: [
      'src/lib/builder/distribution-manager.spec.ts',
      'src/lib/builder/distribution.service.behaviour.spec.ts',
    ],
  },
  {
    name: 'service/reissue-clears-invite-id',
    behaviour: 'reissueLink clears ONLY the token; clearing the invite id orphans the old invite',
    file: 'packages/Angular/src/lib/builder/distribution.service.ts',
    find: "    dist.PublicLinkToken = null;\n    return this.saveDist(dist, 'reissue this link');",
    replace: "    dist.PublicLinkToken = null;\n    dist['MagicLinkInviteID'] = null;\n    return this.saveDist(dist, 'reissue this link');",
    suite: 'packages/Angular',
    killedBy: ['src/lib/builder/distribution.service.behaviour.spec.ts'],
  },
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
  // --- submit-pipeline: a bucket needs a caller, and a knockout row needs its screen ----------
  {
    name: 'pipeline/session-gate-charged-to-blank-callers',
    behaviour: 'the per-session gate is charged only where a session identifies someone, so every header-less caller does not share the tightest bucket',
    file: 'packages/Server/src/public-submit/submit-pipeline.ts',
    find: '  if (sessionIdentity(ctx.sessionId) || !identity) {',
    replace: '  if (true) {',
    suite: 'packages/Server',
    killedBy: ['src/public-submit/__tests__/submit-pipeline.spec.ts'],
  },
  {
    name: 'pipeline/disqualifying-screen-not-recorded',
    behaviour: 'a Disqualified row records WHICH screen screened the respondent out, which on the zero-answer path is its whole content',
    file: 'packages/Server/src/public-submit/submit-pipeline.ts',
    find: '        disqualifiedByScreenId: disqualifiedBy?.id,',
    replace: '        disqualifiedByScreenId: undefined,',
    suite: 'packages/Server',
    killedBy: ['src/public-submit/__tests__/disqualification-gates.spec.ts'],
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
