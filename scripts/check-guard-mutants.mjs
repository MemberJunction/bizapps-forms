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
    file: 'packages/Server/src/public-submit/snapshot-parser.ts',
    find: '    if (!q) {\n      return undefined;\n    }',
    replace: '    if (!q) {\n      continue;\n    }',
    suite: 'packages/Server',
    killedBy: ['src/public-submit/__tests__/snapshot-parser.spec.ts'],
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
  // --- FormDistributionEntityServer: a save carries the STORED pair, and writers take turns ------
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
    name: 'hook/turns-not-taken',
    behaviour: 'two saves of one row are serialised, so a save mid-rotation cannot mint a second replacement',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '    return takeTurn(this.ID, () => this.saveAndProvision(options));',
    replace: '    return this.saveAndProvision(options);',
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
