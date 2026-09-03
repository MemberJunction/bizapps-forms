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
 *   - A run that produces no vitest summary is CRASHED, not killed. A compile error in the
 *     mutated file also reads as a failed run, so every `replace` below is code that COMPILES —
 *     a mutant killed by tsc would be killed for the wrong reason.
 *
 * Cost: one package suite per mutant. CoreEntitiesServer's is ~0.3s, Angular's a few seconds.
 * Serial on purpose — a dozen mutants is about a minute and a worker pool is more harness to own.
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
    find: "  const owner = foldSessionId(response.AnonymousSessionID);\n  return owner === '' || owner === foldSessionId(callerSessionId);",
    replace: "  const owner = foldSessionId(response.AnonymousSessionID);\n  void owner;\n  return true;",
    suite: 'packages/Server',
  },
  {
    name: 'scope/absent-credential-more-permissive-than-a-wrong-one',
    behaviour: 'a MISSING session header is refused exactly as a forged one is — never treated as a match',
    file: 'packages/Server/src/public-submit/persistence.service.ts',
    find: "  return owner === '' || owner === foldSessionId(callerSessionId);",
    replace: "  return owner === '' || foldSessionId(callerSessionId) === '' || owner === foldSessionId(callerSessionId);",
    suite: 'packages/Server',
  },
  // --- public-submit: a half-understood snapshot is never served to a respondent ------------
  {
    name: 'snapshot/malformed-question-dropped-instead-of-failing',
    behaviour: 'one malformed QUESTION fails the whole snapshot rather than silently vanishing from the form',
    file: 'packages/Server/src/public-submit/snapshot-parser.ts',
    find: '    if (!q) {\n      return undefined;\n    }',
    replace: '    if (!q) {\n      continue;\n    }',
    suite: 'packages/Server',
  },
  // --- respondent-host door: the refusals that happen BEFORE a credential is minted ----------
  {
    name: 'door/version-read-failure-reported-as-unpublished',
    behaviour: 'a FAILED published-version read is 502 redeem-failed, never 409 "not published yet"',
    file: 'packages/Server/src/respondent-host/redeem.service.ts',
    find: '  if (published === undefined) {\n    return { ok: false, reason: \'redeem-failed\' };\n  }',
    replace: '  if (false) {\n    return { ok: false, reason: \'redeem-failed\' };\n  }',
    suite: 'packages/Server',
  },
  {
    name: 'door/missing-credential-outranked-by-the-calendar',
    behaviour: 'a link with no PublicLinkToken is "not ready", ahead of any not-yet-open or full reason',
    file: 'packages/Server/src/respondent-host/redeem.service.ts',
    find: "  const rawToken = dist.PublicLinkToken;\n  if (!rawToken) {\n    return { verdict: 'refuse', reason: 'no-token' };\n  }",
    replace: "  const rawToken = dist.PublicLinkToken ?? 'guard-neutralised';",
    suite: 'packages/Server',
  },
  {
    name: 'door/opening-time-not-checked-for-being-future',
    behaviour: 'an opening time that is not ahead of the reader is not named, and sets no Retry-After',
    file: 'packages/Server/src/respondent-host/error-view.ts',
    find: '  const knowsWhen = opensAt !== undefined && !Number.isNaN(opensAt.getTime()) && opensAt > now;',
    replace: '  const knowsWhen = opensAt !== undefined && !Number.isNaN(opensAt.getTime());',
    suite: 'packages/Server',
  },
  {
    name: 'door/retry-after-dropped',
    behaviour: 'a temporary refusal puts Retry-After on the wire, so a monitor records "later" not "gone"',
    file: 'packages/Server/src/respondent-host/error-view.ts',
    find: "  if (view.retryAfter) {",
    replace: "  if (false) {",
    suite: 'packages/Server',
  },
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
    behaviour: 'inside the transaction, Delete() runs super.Delete FIRST — a refused delete then commits no revoke',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    // A real, compiling reorder: revoke first, then delete. A refused delete then returns false and
    // the transaction COMMITS the revoke — a live link's credential dead over a bounced delete.
    find: "        if (!(await super.Delete(options))) {\n          return false;\n        }\n        const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser, host);",
    replace: "        const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser, host);\n        if (!(await super.Delete(options))) {\n          return false;\n        }",
    suite: 'packages/CoreEntitiesServer',
  },
  {
    name: 'hook/delete-revoke-outside-transaction',
    behaviour: "the revoke is created on the row's own provider, so it joins the delete's transaction",
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: "        const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser, host);",
    replace: "        const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser);",
    suite: 'packages/CoreEntitiesServer',
  },
  {
    name: 'hook/delete-revoke-failure-swallowed',
    behaviour: 'a failed revoke rolls the delete back and refuses it, rather than committing an orphan',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: "        if (!revoked.success) {\n          throw new Error(revoked.message ?? 'unknown error');\n        }",
    replace: "        if (!revoked.success) {\n          LogError(revoked.message ?? 'unknown error');\n        }",
    suite: 'packages/CoreEntitiesServer',
  },
  // --- FormDistributionEntityServer: a save carries the STORED pair, and writers take turns ------
  {
    name: 'hook/adopt-neutralised',
    behaviour: 'an update re-reads the credential pair from the store, so a stale instance cannot revert a rotation',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: "  private async adoptStoredCredential(): Promise<void> {\n    if (this.credentialWriteInFlight || !this.IsSaved) {",
    replace: "  private async adoptStoredCredential(): Promise<void> {\n    if (true) { return; }\n    if (this.credentialWriteInFlight || !this.IsSaved) {",
    suite: 'packages/CoreEntitiesServer',
  },
  {
    name: 'hook/adopt-drops-clear',
    behaviour: 'adopting the stored pair keeps a token this client CLEARED — the reissue request survives',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '    this.PublicLinkToken = clearRequested ? null : stored.PublicLinkToken;',
    replace: '    this.PublicLinkToken = stored.PublicLinkToken;',
    suite: 'packages/CoreEntitiesServer',
  },
  {
    name: 'hook/turns-not-taken',
    behaviour: 'two saves of one row are serialised, so a save mid-rotation cannot mint a second replacement',
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '    return takeTurn(this.ID, () => this.saveAndProvision(options));',
    replace: '    return this.saveAndProvision(options);',
    suite: 'packages/CoreEntitiesServer',
  },
  // --- FormDistributionEntityServer: the context is built from the columns of the same meaning --
  {
    name: 'hook/ctx-isactive-mismapped',
    behaviour: "the decision reads the row's IsActive, not a constant",
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '          isActive: this.IsActive,',
    replace: '          isActive: true,',
    suite: 'packages/CoreEntitiesServer',
  },
  {
    name: 'hook/ctx-closeat-dropped',
    behaviour: "the mint is bounded by the row's CloseAt",
    file: 'packages/CoreEntitiesServer/src/magic-link/FormDistributionEntityServer.ts',
    find: '          closeAt: this.CloseAt,',
    replace: '          closeAt: null,',
    suite: 'packages/CoreEntitiesServer',
  },
  // --- provision-runner: the reissue is one save ----------------------------------------------
  {
    name: 'runner/reissue-single-save',
    behaviour: 'a reissue writes the new pair in ONE save, never an intermediate (null, null)',
    file: 'packages/CoreEntitiesServer/src/magic-link/provision-runner.ts',
    find: "    const revoked = await revokeInvite(ctx, minter, contextUser);\n    if (revoked !== 'revoked') {\n      return { result: revoked, inviteId: ctx.magicLinkInviteId ?? undefined };\n    }\n    return issueCredential(",
    replace: "    const revoked = await revokeInvite(ctx, minter, contextUser);\n    if (revoked !== 'revoked') {\n      return { result: revoked, inviteId: ctx.magicLinkInviteId ?? undefined };\n    }\n    await persistCredential(null);\n    return issueCredential(",
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
    find: "    dist.PublicLinkToken = null;\n    return this.saveDist(dist, 'reissue this link');",
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
    find: "  private warnIfStillUnissued(linkId: string, wrote: 'issue' | 'reissue'): void {\n    if (this.actionError !== null) {",
    replace: "  private warnIfStillUnissued(linkId: string, wrote: 'issue' | 'reissue'): void {\n    if (false) {",
    suite: 'packages/Angular',
  },
  // --- submit-pipeline: a bucket needs a caller, and a knockout row needs its screen ----------
  {
    name: 'pipeline/session-gate-charged-to-blank-callers',
    behaviour: 'the per-session gate is charged only where a session identifies someone, so every header-less caller does not share the tightest bucket',
    file: 'packages/Server/src/public-submit/submit-pipeline.ts',
    find: '  if (sessionIdentity(ctx.sessionId) || !identity) {',
    replace: '  if (true) {',
    suite: 'packages/Server',
  },
  {
    name: 'pipeline/disqualifying-screen-not-recorded',
    behaviour: 'a Disqualified row records WHICH screen screened the respondent out, which on the zero-answer path is its whole content',
    file: 'packages/Server/src/public-submit/submit-pipeline.ts',
    find: '        disqualifiedByScreenId: disqualifiedBy?.id,',
    replace: '        disqualifiedByScreenId: undefined,',
    suite: 'packages/Server',
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

/** Run a package's vitest suite and read its summary line. */
function runSuite(cwd) {
  const res = spawnSync('npx', ['vitest', 'run', '--reporter=default'], {
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
    const baseline = runSuite(join(REPO_ROOT, suite));
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
        `\n❌ ${bad - stale} guard(s) can be neutralised with the suite green. ` +
          'Write the behavioural test each entry names.',
      );
    }
    process.exit(1);
  }
  console.log(`\n✅ Guard-mutation check passed — all ${MUTANTS.length} load-bearing guards are killed by their package suite.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
