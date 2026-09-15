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
};
