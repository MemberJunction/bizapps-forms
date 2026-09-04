---
"@mj-biz-apps/forms-entities": patch
---

Ship the CodeGen-append convention as a rule and a gate. `plans/DISTRIBUTION_SEED_PLAN.md` no longer
blesses a second convention; `.claude/rules/migrations-codegen.md` loads when a migration is touched;
`npm run lint:codegen-append` fails a tracked `CodeGen_Run_*.sql` and a schema-DDL migration that
ships no CodeGen output.
