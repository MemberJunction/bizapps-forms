/**
 * What the two in-process credential smokes share: the assertion recorder, the entity-layer reads
 * and writes they both drive, the redeem call, and the boot-run-exit envelope.
 *
 * Extracted because each script carried its own copy of all of it — ninety lines that had already
 * begun to differ in error text and label prefix — and a review of PR #109 named the drift. One
 * helper per fact, so the two scripts read as the ASSERTIONS they make and nothing else.
 *
 * Lives beside them, under `apps/MJAPI`, for the reason they do: everything here needs
 * `@memberjunction/server-bootstrap`, which is installed only under this harness, and Node
 * resolves bare specifiers from the importing FILE's location.
 */
import { createMJServer } from '@memberjunction/server-bootstrap';
import { RESOLVER_PATHS } from '@mj-biz-apps/forms-server';
import '@memberjunction/server-bootstrap/mj-class-registrations';
import { Metadata, RunView } from '@memberjunction/core';

export const DIST_ENTITY = 'MJ_BizApps_Forms: Form Distributions';
export const INVITE_ENTITY = 'MJ: Magic Link Invites';

/**
 * A pass/fail recorder. `summary()` prints the tally and the failures, and returns whether every
 * check passed — the value the process exits on.
 */
export function assertions() {
  let passed = 0;
  let failed = 0;
  const failures = [];
  const check = (name, ok, detail = '') => {
    if (ok) {
      passed++;
      console.log(`  ok    ${name}`);
    } else {
      failed++;
      failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
      console.error(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`);
    }
  };
  const eq = (name, actual, expected) =>
    check(name, String(actual) === String(expected), `expected ${expected}, got ${actual}`);
  const section = (m) => console.log(`\n--- ${m} ---`);
  const summary = () => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) {
      console.error('\nFailures:');
      failures.forEach((f) => console.error(`  - ${f}`));
    }
    return failed === 0;
  };
  return { check, eq, section, summary };
}

/** Read an invite straight out of the database, bypassing any in-memory entity state. */
export async function readInvite(user, id) {
  if (!id) return null;
  const r = await new RunView().RunView(
    { EntityName: INVITE_ENTITY, ExtraFilter: `ID='${id}'`, ResultType: 'simple' },
    user,
  );
  if (!r.Success) throw new Error(`invite read failed: ${r.ErrorMessage}`);
  return r.Results?.[0] ?? null;
}

/** A fresh entity object for a distribution, loaded as `user`. */
export async function loadDistribution(user, id) {
  const d = await new Metadata().GetEntityObject(DIST_ENTITY, user);
  if (!(await d.Load(id))) throw new Error(`could not load distribution ${id} as ${user.Name}`);
  return d;
}

/**
 * Ask core to redeem a raw token, exactly as `/f/:slug` does.
 *
 * Returns `{ ok, status, errorCode }`. A refusal is the interesting outcome for most callers, so
 * the non-2xx body is parsed rather than thrown on — "it failed somehow" would let a 500
 * masquerade as a successful revocation, which is the one mistake that would make a smoke lie.
 */
export async function redeem(base, rawToken) {
  const res = await fetch(`${base}/magic-link/redeem?format=json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: rawToken }),
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  return {
    ok: res.ok && !!(body.token || body.accessToken || body.jwt),
    status: res.status,
    errorCode: body.errorCode ?? body.error ?? null,
  };
}

/** A form to hang test distributions off — whatever this database happens to carry. */
export async function anyFormId(user) {
  const r = await new RunView().RunView(
    { EntityName: 'MJ_BizApps_Forms: Forms', ResultType: 'simple', Fields: ['ID'], MaxRows: 1 },
    user,
  );
  if (!r.Success || !r.Results?.length) {
    throw new Error(`no Form rows to test against: ${r.ErrorMessage ?? 'empty'}`);
  }
  return r.Results[0].ID;
}

/**
 * A live public link created by `creator`, returned holding whatever credential the hook issued
 * it. `prefix` names the script in the row's Name and Slug, so a leftover is attributable.
 */
export async function newLiveLink(creator, formId, prefix, label) {
  const d = await new Metadata().GetEntityObject(DIST_ENTITY, creator);
  d.NewRecord();
  d.FormID = formId;
  d.Name = `${prefix} ${label}`;
  d.Slug = `${prefix}-${label}-${Date.now().toString(36)}`;
  d.ChannelType = 'PublicLink';
  d.Status = 'Active';
  d.IsActive = true;
  d.ResponseCount = 0;
  d.CaptchaRequired = false;
  if (!(await d.Save())) throw new Error(`create failed: ${d.LatestResult?.CompleteMessage}`);
  return d;
}

/** Delete every distribution a run created, as `user`; a failure is reported, never thrown. */
export async function deleteDistributions(user, ids) {
  for (const id of ids) {
    try {
      const d = await new Metadata().GetEntityObject(DIST_ENTITY, user);
      if (await d.Load(id)) await d.Delete();
    } catch (e) {
      console.error(`  cleanup: could not delete ${id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/**
 * Boot the harness, run `run` once it is listening, and exit with its verdict.
 *
 * `cleanup` runs after `run` whether it passed, failed or threw, AND when the boot itself fails —
 * a script that seeded rows before booting must remove them either way. A cleanup failure is
 * reported but never replaces the run's own outcome or the boot error, which is the interesting one.
 */
export function bootAndRun(run, { cleanup } = {}) {
  const tidy = (why) => {
    if (!cleanup) return;
    try {
      cleanup();
    } catch (e) {
      console.error(`  cleanup (${why}): ${e instanceof Error ? e.message : e}`);
    }
  };
  createMJServer({
    resolverPaths: RESOLVER_PATHS,
    afterStart: async () => {
      let ok = false;
      try {
        ok = await run();
      } catch (e) {
        console.error('\nSMOKE THREW:', e);
      } finally {
        tidy('after the run');
      }
      process.exit(ok ? 0 : 1);
    },
  }).catch((e) => {
    console.error(e);
    tidy('after a failed boot');
    process.exit(1);
  });
}
