/**
 * The Forms Remote Operation metadata and the typed bases CodeGen emits from it.
 *
 * The generated file exists only as long as the `MJ: Remote Operations` rows do, and CodeGen emits
 * whatever the database it ran against holds. Regenerate against a database that never received
 * `metadata/remote-operations/` and every `Forms*Operation` class silently vanishes, along with the
 * I/O types every later engine, client and the widget import. So this pins the metadata against the
 * CHECKED-IN generated module, in both directions, and pins the type files against the two ways
 * CodeGen's verbatim emit can go wrong without any error:
 *
 *   - an `import` line in a type file is pasted into `remote_operations.ts` below the generated
 *     header, where it either fails to resolve or quietly couples the browser-safe contract to
 *     whatever it named;
 *   - two type files exporting the same name do not collide — CodeGen de-duplicates declarations by
 *     NAME and keeps the first, so the second definition is dropped and its operation is typed with
 *     someone else's shape.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as RemoteOperations from './generated/remote_operations';

const OPS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'metadata', 'remote-operations');
const TYPES_DIR = join(OPS_DIR, 'types');

interface RemoteOperationRecord {
  fields: {
    Name: string;
    OperationKey: string;
    InputTypeName: string;
    InputTypeDefinition: string;
    OutputTypeName: string;
    OutputTypeDefinition: string;
    ExecutionMode: string;
    RequiresSystemUser: boolean;
    GenerationType: string;
    CodeApprovalStatus: string;
    Status: string;
    RequiredScope?: string;
  };
  primaryKey: { ID: string };
}

/** Every operation spec §3 names. Pinned so a dropped record fails here, not in Task 4–10. */
const EXPECTED_KEYS = [
  'Forms.ArchiveForm',
  'Forms.CloneForm',
  'Forms.CloseDistribution',
  'Forms.CreateFormFromTemplate',
  'Forms.GetDistributionClaims',
  'Forms.GetRespondentForm',
  'Forms.GetResponseDetail',
  'Forms.GetResponseSummary',
  'Forms.IssueDistributionLink',
  'Forms.ListResponses',
  'Forms.OpenDistribution',
  'Forms.PublishForm',
  'Forms.ReissueDistributionLink',
  'Forms.RemoveAutomation',
  'Forms.ReorderAutomations',
  'Forms.RestoreForm',
  'Forms.SaveAutomation',
  'Forms.SaveResponse',
];

const records: RemoteOperationRecord[] = JSON.parse(
  readFileSync(join(OPS_DIR, '.forms-remote-operations.json'), 'utf8'),
) as RemoteOperationRecord[];

/** CodeGen's class naming: the dotted key without dots, plus `Operation`. */
function classNameFor(operationKey: string): string {
  return operationKey.split('.').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('') + 'Operation';
}

/** `@file:types/x.ts` → the type file's text. Throws on any other shape, so a typo is loud. */
function typeFileText(reference: string): string {
  const match = /^@file:(types\/[a-z0-9.-]+\.ts)$/.exec(reference);
  if (!match) {
    throw new Error(`Type definition reference '${reference}' is not an @file:types/<name>.ts pointer.`);
  }
  return readFileSync(join(OPS_DIR, match[1]), 'utf8');
}

/** Names of the top-level `export type|interface` declarations in a type file. */
function exportedNames(text: string): string[] {
  return [...text.matchAll(/^export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
}

type OperationClass = new () => { OperationKey: string; ExecutionMode: string; RequiresSystemUser?: boolean; RequiredScope?: string };

function generatedClass(name: string): OperationClass | undefined {
  const exported = (RemoteOperations as Record<string, unknown>)[name];
  return typeof exported === 'function' ? (exported as OperationClass) : undefined;
}

describe('Forms remote operation metadata', () => {
  it('declares exactly the operations spec §3 names', () => {
    expect(records.map((r) => r.fields.OperationKey).sort()).toEqual(EXPECTED_KEYS);
  });

  it('gives every record the decided rails: Manual, Sync, Approved, Active, no system user, no scope', () => {
    for (const { fields } of records) {
      expect(fields.GenerationType, fields.OperationKey).toBe('Manual');
      expect(fields.ExecutionMode, fields.OperationKey).toBe('Sync');
      expect(fields.CodeApprovalStatus, fields.OperationKey).toBe('Approved');
      expect(fields.Status, fields.OperationKey).toBe('Active');
      expect(fields.RequiresSystemUser, fields.OperationKey).toBe(false);
      // RequiredScope gates API keys only; authorization is each operation's Authorize().
      expect(fields.RequiredScope, fields.OperationKey).toBeUndefined();
    }
  });

  it('carries a distinct primary key per record', () => {
    const ids = records.map((r) => r.primaryKey.ID.toUpperCase());
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('generated Forms operation classes', () => {
  it.each(EXPECTED_KEYS)('%s has a generated class carrying its key and rails', (key) => {
    const Operation = generatedClass(classNameFor(key));
    if (!Operation) {
      throw new Error(
        `No ${classNameFor(key)} in generated/remote_operations.ts. CodeGen ran against a database ` +
          `without metadata/remote-operations/, or mj.config.cjs lost its RemoteOperations output.`,
      );
    }
    const instance = new Operation();
    expect(instance.OperationKey).toBe(key);
    expect(instance.ExecutionMode).toBe('Sync');
    expect(instance.RequiresSystemUser).toBe(false);
    expect(instance.RequiredScope).toBeUndefined();
  });

  it('has no Forms operation class that metadata does not declare', () => {
    const generated = Object.keys(RemoteOperations).filter((n) => /^Forms[A-Za-z]+Operation$/.test(n));
    expect(generated.sort()).toEqual(EXPECTED_KEYS.map(classNameFor).sort());
  });
});

describe('operation type files', () => {
  const files = readdirSync(TYPES_DIR).filter((f) => f.endsWith('.ts'));

  it('contain no import lines (CodeGen pastes them verbatim)', () => {
    for (const file of files) {
      const text = readFileSync(join(TYPES_DIR, file), 'utf8');
      expect(/^\s*import\s/m.test(text), file).toBe(false);
    }
  });

  it('export every name exactly once across the directory (CodeGen keeps the first of a duplicate name)', () => {
    const seen = new Map<string, string>();
    for (const file of files) {
      for (const name of exportedNames(readFileSync(join(TYPES_DIR, file), 'utf8'))) {
        expect(seen.get(name), `${name} is exported by both ${seen.get(name)} and ${file}`).toBeUndefined();
        seen.set(name, file);
      }
    }
  });

  it('prefix every exported name with Forms, so no other app or core operation can shadow it', () => {
    for (const file of files) {
      for (const name of exportedNames(readFileSync(join(TYPES_DIR, file), 'utf8'))) {
        expect(name.startsWith('Forms'), `${file}: ${name}`).toBe(true);
      }
    }
  });

  it.each(records.map((r) => [r.fields.OperationKey, r.fields] as const))(
    '%s names input and output types its files actually declare',
    (_key, fields) => {
      expect(exportedNames(typeFileText(fields.InputTypeDefinition))).toContain(fields.InputTypeName);
      expect(exportedNames(typeFileText(fields.OutputTypeDefinition))).toContain(fields.OutputTypeName);
    },
  );

  it('are all referenced by some operation (an orphan file is a contract nobody can reach)', () => {
    const referenced = new Set(
      records.flatMap((r) => [r.fields.InputTypeDefinition, r.fields.OutputTypeDefinition]).map((ref) => ref.replace('@file:types/', '')),
    );
    expect(files.filter((f) => !referenced.has(f))).toEqual([]);
  });
});
