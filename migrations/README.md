# Migrations (SQL Server)

Flyway/Skyway-style migrations for the `__mj_BizAppsForms` schema.

This directory is intentionally empty in the scaffold. The Forms schema is authored
in **Phase 1** of the build plan (`plans/FORMS_BUILD_PLAN.md`). Migration files
follow the convention `VYYYYMMDDHHMM__v<ver>__<Description>.sql` and use the
`${flyway:defaultSchema}` placeholder. Run with `npm run mj:migrate`.
