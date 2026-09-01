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
    // reads ['revoke', 'delete', 'revoke'], which toEqual(['delete', 'revoke']) rejects.
    find: '    if (!(await super.Delete(options))) {\n      return false;\n    }\n    if (!inviteId) {\n      return true;\n    }\n\n    const minter = MagicLinkMinterRegistry.Instance.Minter;',
    replace: '    const minter = MagicLinkMinterRegistry.Instance.Minter;\n    if (inviteId && minter && contextUser) {\n      await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser);\n    }\n    if (!(await super.Delete(options))) {\n      return false;\n    }\n    if (!inviteId) {\n      return true;\n    }',
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
    cwd,
    encoding: 'utf-8',
    timeout: SUITE_TIMEOUT_MS,
    env: { ...process.env, CI: '1' },
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
    console.log(`baseline ${suite}: ${baseline.passed} passing`);
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
