/**
 * MemberJunction API Server (MJ 3.0 Minimal Architecture)
 * All initialization logic is in @memberjunction/server-bootstrap
 */
import { createMJServer } from '@memberjunction/server-bootstrap';

// Import the Forms server bootstrap (registers entities, actions, and resolvers)
import { RESOLVER_PATHS } from '@mj-biz-apps/forms-server';

/**
 * Register the sibling Open Apps' generated entity subclasses.
 *
 * Forms' on-submit hooks write across schemas — Upsert Respondent Person creates a
 * `MJ_BizApps_Common: People` row, Create Followup Task creates a
 * `MJ_BizApps_Tasks: Tasks` row — and both siblings are hard `mj-app.json`
 * dependencies. Without their subclasses registered, MJ's class factory hands back a
 * plain BaseEntity, so every field assignment lands on a throwaway object and the save
 * fails with "First Name cannot be null" on fields that were plainly set.
 *
 * A real host (e.g. bizapps-caliber) loads every installed app's packages, so this is
 * true there for free. This harness previously loaded only forms-server, which made it
 * unable to exercise the cross-schema hooks at all — the e2e run looked green while two
 * of the four hooks could never have worked.
 *
 * The imports are runtime, not type-only, on purpose: the registration IS the side
 * effect being imported for.
 */
import { LoadGeneratedEntities as LoadCommonEntities } from '@mj-biz-apps/common-entities';
import { LoadGeneratedEntities as LoadTasksEntities } from '@mj-biz-apps/tasks-entities';

LoadCommonEntities();
LoadTasksEntities();

// Import pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap/mj-class-registrations';

// Optional: Import communication providers if needed
// import '@memberjunction/communication-sendgrid';
// import '@memberjunction/communication-teams';

// Optional: Import custom auth/user creation logic
// See: /docs/examples/custom-user-creation/README.md
// import './custom/customUserCreation';

// Start the server
createMJServer({ resolverPaths: RESOLVER_PATHS }).catch(console.error);
