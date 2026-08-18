/**
 * MJAPI dev harness for MJ Forms (MJ 6.1.0-edge era).
 *
 * Same shape as MJ's reference packages/MJAPI: all initialization lives in
 * @memberjunction/server-bootstrap; this file only registers what the host carries.
 *
 * Forms' on-submit hooks write across schemas (Upsert Respondent Person → common,
 * Create Followup Task → tasks), so the sibling apps' generated entity subclasses
 * must be registered here or those saves land on a plain BaseEntity and fail.
 *
 * Run from this directory (cosmiconfig picks up ./mj.config.cjs, dotenv ./.env):
 *   node server.mjs
 */
import 'dotenv/config';
import { createMJServer } from '@memberjunction/server-bootstrap';
import { RESOLVER_PATHS } from '@mj-biz-apps/forms-server';
import { LoadGeneratedEntities as LoadCommonEntities } from '@mj-biz-apps/common-entities';
import { LoadGeneratedEntities as LoadTasksEntities } from '@mj-biz-apps/tasks-entities';

// Pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap/mj-class-registrations';

// THROWAWAY: local-disk storage driver so uploads have somewhere to put bytes in dev.
// Not shipped anywhere — exists to prove out the résumé-upload path (issue #49 / R28).
import './throwaway-local-storage.mjs';

LoadCommonEntities();
LoadTasksEntities();

createMJServer({ resolverPaths: RESOLVER_PATHS }).catch(console.error);
