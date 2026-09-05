---
paths:
  - "packages/*/src/generated/**"
  - "packages/*/src/**/generated/**"
---

# Generated code

## The rule

**Never hand-edit anything under `packages/*/src/**/generated/`.** Apply your migration to a
database, run `mj codegen`, and commit what it writes.

CLAUDE.md has said this since the scaffold. It is repeated here with its reasoning, and enforced by
`.claude/hooks/block-generated-edits.mjs`, because saying it was not enough: it was broken on #156
by an agent that had read the rule, in a pull request that then argued the exception was justified.

## Why the near miss is the argument, not against it

The #156 edit added four properties to `entity_subclasses.ts` by hand. A real `mj codegen` run
afterwards produced those four properties **byte-identical** — the Zod entries, the accessors, the
GraphQL fields, the Angular form fields, all of it. On the narrow question of "did the hand edit get
the content right," it did.

It was still the wrong artifact, and the same run says why. It also:

- moved every entity class out of `entity_subclasses.ts` into `generated/entities/<schema>.ts`,
  leaving a five-line barrel behind (and did the same to `generated.ts` →
  `generated/graphql-schemas/<schema>.ts`);
- rewrote **twelve** Angular form templates across every Forms entity, not the two the change was
  about, with the `NewRecordValues/2` and `ShowToolbar/true` shapes MJ 6.1.0-edge.5 emits;
- and thereby broke `packages/Angular/src/lib/templates/form-clone-columns.spec.ts`, a drift guard
  that read the generated classes at a hardcoded path.

A hand edit gets the **lines** right and the **layout** wrong, and the layout is what everything
downstream reads. That is not a thing careful hand-editing can fix, because the person editing has
no way to know what else that CodeGen version would have moved.

## What the hook does and does not prove

`.claude/hooks/block-generated-edits.mjs` denies `Write` / `Edit` / `NotebookEdit` on any path
matching `packages/<Pkg>/src/**/generated/**`. It is Node with no dependencies — an earlier shell
version failed **open** in testing because the hook environment resolved neither `bash` nor `grep`,
which is exactly the silent failure a guard must not have.

It is a tripwire, not a proof. It binds this repo's Claude Code sessions. It does not bind an
editor, and it cannot tell a hand edit from a regeneration after the fact.

**The durable check is a codegen-determinism job**: build a database from `migrations/` alone, run
CodeGen, and fail if the committed output differs. MJ runs exactly this (its IT50 / CD3 / CD5 / CD6
checks — see the header of
`MJ/migrations/v6/V202608201800__v6.1.x__Regenerate_Hierarchy_Views_And_FormChromeRule_Entity.sql`).
It needs a SQL Server service in CI plus the leaf-first `common → tasks → forms` chain, so it is a
piece of work rather than a line of YAML, and it is not in place here yet.

**Do not substitute a checksum manifest for it.** That was tried for metadata seeding and retired in
#105 for a reason that applies here unchanged: regenerating the manifest without regenerating the
artifact turns the gate green while the artifact is wrong, so the gate's failure mode is a silent
pass in the exact direction it was meant to catch.

## If you genuinely need an exception

Remove the hook from `.claude/settings.json` in the **same commit** as the edit, so the exception is
reviewable rather than silent, and say in the PR body why regenerating was not possible.

Routing around it by writing the file from `Bash` instead is not an exception. It is the same defect
with the evidence removed.

## Running CodeGen without touching anyone's data

The reason hand-editing is tempting is the belief that regenerating is expensive. It is not, and it
must not be done against the shared dev database:
[`docs/database-operations.md`](../../docs/database-operations.md) carries the clean-room recipe —
restore a base backup, apply your migration, run `mj codegen`, commit. Minutes, and nobody else's
host moves.
