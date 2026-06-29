/**
 * @mj-biz-apps/forms-core-entities-server
 *
 * Server-side entity subclasses for MJ Forms entities. These classes override
 * Save()/Delete()/ValidateAsync() to add lifecycle hooks (anonymous-submission
 * hardening, cross-record invariants, version snapshotting) that must run only
 * on the server.
 *
 * Import this package from the server bootstrap so its @RegisterClass decorators
 * fire at startup.
 *
 * PLACEHOLDER — no server-side subclasses exist yet. They are authored in Phase 1
 * once the Forms schema migration + CodeGen have produced the base entity classes
 * (e.g. a FormResponseEntityServer for public-write hardening). See
 * plans/FORMS_BUILD_PLAN.md §4 and §5.1.
 */

export {};
