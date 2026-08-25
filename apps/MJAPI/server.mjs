/**
 * MJAPI dev harness for MJ Forms (MJ 6.1.0-edge era).
 *
 * Same shape as MJ's reference packages/MJAPI: all initialization lives in
 * @memberjunction/server-bootstrap; this file only registers what the host carries.
 *
 * Forms' on-submit hooks write across schemas (Upsert Respondent Person → common,
 * Create Followup Task → tasks), so the sibling apps' generated entity subclasses must be
 * registered or those saves land on a plain BaseEntity — where every typed field assignment is
 * silently discarded and the record persists as nulls (#60).
 *
 * This file used to do that registration itself, which is why the failure never appeared HERE and
 * did on every other host: the knowledge lived in the dev harness rather than in the shipped
 * package. `@mj-biz-apps/forms-actions` now imports both sibling entity packages from its own
 * barrel, and `forms-server`'s index side-effect-imports that barrel, so importing RESOLVER_PATHS
 * below is enough. Keep it that way — re-adding the loads here would hide a regression in the
 * package from the one stack that runs it.
 *
 * Run from this directory (cosmiconfig picks up ./mj.config.cjs, dotenv ./.env):
 *   node server.mjs
 */
import 'dotenv/config';
import { createMJServer } from '@memberjunction/server-bootstrap';
import { RESOLVER_PATHS } from '@mj-biz-apps/forms-server';

// Pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap/mj-class-registrations';

// THROWAWAY: local-disk storage driver so uploads have somewhere to put bytes in dev.
// Not shipped anywhere — exists to prove out the résumé-upload path (issue #49 / R28).
import './throwaway-local-storage.mjs';

createMJServer({ resolverPaths: RESOLVER_PATHS }).catch(console.error);
