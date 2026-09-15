/**
 * The core-schema name, kept for generated resolvers that reference it by import.
 *
 * NOTHING IMPORTS THIS TODAY. The comment this replaces said "CodeGen imports this from
 * generated/generated.ts", which was already untrue before the MJ 6.1 relayout — generated output
 * takes the core schema from `@memberjunction/server` (`import * as
 * mj_core_schema_server_object_types`), not from here. The relayout then made the old wording
 * doubly wrong by turning `generated/generated.ts` into a barrel that imports nothing at all.
 *
 * Left in place rather than deleted because that is a public-surface decision for its own change,
 * not a side effect of a hierarchy fix. `config.ts` is not re-exported from `index.ts`, so this is
 * dead rather than load-bearing; see the deferred finding filed alongside PR #164.
 */
export const mj_core_schema = '__mj';
