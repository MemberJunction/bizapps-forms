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
  // MJ's durable work queue (#303 §5): this host runs the `forms.run-automations` subscription, so a
  // submitted response's on-submit automations run here, at least once, from the
  // `forms.response-submitted` message published in the submit transaction. Host requirements:
  // the database needs READ_COMMITTED_SNAPSHOT ON (MJ logs an error at startup without it), and
  // `systemUserEmail` must name an existing user — handlers read as it (the steps themselves run as
  // the Forms automation principal). The default is the email a freshly installed MJ gives its
  // System user; set FORMS_WORK_QUEUE_SYSTEM_USER_EMAIL where that differs.
  workQueue: {
    enabled: true,
    systemUserEmail: process.env.FORMS_WORK_QUEUE_SYSTEM_USER_EMAIL || 'not.set@nowhere.com',
    subscriptions: [{ name: 'forms.run-automations', concurrency: 2 }],
  },
};
