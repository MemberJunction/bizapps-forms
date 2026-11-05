/**
 * Harness-local MJ config: everything from the repo root config, plus the host-side
 * `magicLink` block the anonymous respondent path requires (cosmiconfig loads the
 * NEAREST mj.config.cjs to cwd, so running the server from this directory picks this
 * file — the root one stays untouched for CLI/codegen use).
 *
 * The RS256 private key comes from MJ_MAGIC_LINK_PRIVATE_KEY in .env (the schema's
 * default), so it is not repeated here.
 */
const root = require('../../mj.config.cjs');

module.exports = {
  ...root,
  magicLink: {
    enabled: true,
    // The anonymous respondent role must be grantable or invites cannot carry it
    // (forms-server host-readiness check).
    grantableRoleNames: ['Form Respondent'],
  },
  // MJ's scheduler (#303): it runs the Forms automation outbox sweep (30-second cron, about every 15 s in practice) — retries, and
  // events a stopped process left behind (first attempts run in the submitting process, after commit,
  // with or without this). MJ enables it by default; stated here so the harness does not depend on
  // that. `systemUserEmail` must name an existing user — the sweep reads as it (the steps themselves
  // run as the Forms automation principal). The default is the email a freshly installed MJ gives its
  // System user; set FORMS_SCHEDULER_SYSTEM_USER_EMAIL where that differs.
  scheduledJobs: {
    enabled: true,
    systemUserEmail: process.env.FORMS_SCHEDULER_SYSTEM_USER_EMAIL || 'not.set@nowhere.com',
  },
};
