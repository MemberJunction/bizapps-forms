/**
 * The four owned collections CodeGen emits from `EntityRelationship.RelatedRecordCollection`
 * (`metadata/entity-relationships/`): `Form.Pages`, `Form.Screens`, `FormPage.Questions`,
 * `FormQuestion.Options`.
 *
 * Asserted because the declaration is GENERATED: it exists only as long as the metadata row does.
 * Regenerate against a database that never received the push and the collections silently vanish
 * from the generated module, with nothing failing at build time until the builder's structural save
 * goes looking for one. This guards the CHECKED-IN generated output; it cannot tell you the seed
 * reached any host.
 *
 * READ AS TEXT, not by constructing the entity. `new mjBizAppsFormsFormEntity()` reaches
 * `EntityInfo.AssertEntityActiveStatus` in `BaseEntity`'s constructor and needs a live metadata
 * provider, which no unit test in this repo has. The subject is the generated SOURCE anyway.
 *
 * The join fields are the substance. `MJ_BizApps_Forms: Forms` has relationships to BOTH Form Pages
 * and Form Questions on `FormID`, so a `Questions` collection keyed there instead of on `PageID`
 * would put every question in the form on every page — a wrong answer that looks plausible.
 * (Reused from closed PR #112, which first declared three of these.)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const GENERATED = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'generated', 'entities', '__mj_BizAppsForms.ts'),
  'utf8',
);

/**
 * The source of one generated entity class, so a declaration is attributed to its OWNER.
 *
 * Searching the whole file cannot tell `FormPage.Questions` from `Form.Questions`, and a lookup
 * resolving to the wrong relationship is the single most likely way for this metadata to be wrong.
 */
function classBodyOf(owner: string): string {
  const start = GENERATED.indexOf(`export class ${owner} extends BaseEntity`);
  if (start === -1) {
    throw new Error(`No generated class ${owner} — has CodeGen's class naming changed?`);
  }
  const next = GENERATED.indexOf('\nexport class ', start + 1);
  return GENERATED.slice(start, next === -1 ? GENERATED.length : next);
}

/** The body of one `DeclareRelatedRecords({...})` call, whitespace-normalised. */
function declarationFor(owner: string, name: string): string {
  const match = new RegExp(
    `public readonly ${name} = this\\.DeclareRelatedRecords<[^>]+>\\(\\{([\\s\\S]*?)\\}\\);`,
  ).exec(classBodyOf(owner));
  if (!match) {
    throw new Error(
      `No DeclareRelatedRecords('${name}') on ${owner}. Either the EntityRelationship metadata is ` +
        `missing from the database CodeGen ran against, or the collection was emitted onto a ` +
        `DIFFERENT entity — see metadata/entity-relationships/.`,
    );
  }
  return match[1].replace(/\s+/g, ' ').trim();
}

/** What every one of the four shares: database-backed, writable, loaded by `Load()`, owned. */
function expectOwnedImmediate(declaration: string): void {
  expect(declaration).toContain("OrderBy: 'DisplayOrder ASC'");
  expect(declaration).toContain("Load: 'immediate'");
  expect(declaration).toContain("OnRemove: 'delete'");
  expect(declaration).toContain("Source: 'database'");
  expect(declaration).toContain('ReadOnly: false');
}

describe('Form.Pages', () => {
  it('joins on FormID, sequences from 0 and owns its children', () => {
    const pages = declarationFor('mjBizAppsFormsFormEntity', 'Pages');
    expect(pages).toContain("RelatedEntity: 'MJ_BizApps_Forms: Form Pages'");
    expect(pages).toContain("RelatedEntityJoinField: 'FormID'");
    expectOwnedImmediate(pages);
    // `From: 1` is the framework default; every DisplayOrder already stored is zero-based, so taking
    // it would mark every page in every form dirty on the first reorder and rewrite the lot.
    expect(pages).toContain("Sequence: { Field: 'DisplayOrder', From: 0 }");
  });
});

describe('Form.Screens', () => {
  it('joins on FormID, owns its children, and does NOT renumber', () => {
    const screens = declarationFor('mjBizAppsFormsFormEntity', 'Screens');
    expect(screens).toContain("RelatedEntity: 'MJ_BizApps_Forms: Form Screens'");
    expect(screens).toContain("RelatedEntityJoinField: 'FormID'");
    expectOwnedImmediate(screens);
    // Screen DisplayOrder is numbered WITHIN a ScreenType (the builder writes the count of screens
    // of the same type). One sequence across Welcome and Ending rows would renumber both together.
    expect(screens).not.toContain('Sequence:');
  });
});

describe('FormPage.Questions', () => {
  it('joins on PageID, not FormID, and hangs off the PAGE', () => {
    const questions = declarationFor('mjBizAppsFormsFormPageEntity', 'Questions');
    expect(questions).toContain("RelatedEntity: 'MJ_BizApps_Forms: Form Questions'");
    expect(questions).toContain("RelatedEntityJoinField: 'PageID'");
    expectOwnedImmediate(questions);
    expect(questions).toContain("Sequence: { Field: 'DisplayOrder', From: 0 }");
  });

  it('is not also emitted onto the form', () => {
    expect(classBodyOf('mjBizAppsFormsFormEntity')).not.toMatch(/public readonly Questions = this\.DeclareRelatedRecords/);
  });
});

describe('FormQuestion.Options', () => {
  it('joins on QuestionID and owns its children', () => {
    const options = declarationFor('mjBizAppsFormsFormQuestionEntity', 'Options');
    expect(options).toContain("RelatedEntity: 'MJ_BizApps_Forms: Form Question Options'");
    expect(options).toContain("RelatedEntityJoinField: 'QuestionID'");
    expectOwnedImmediate(options);
    expect(options).toContain("Sequence: { Field: 'DisplayOrder', From: 0 }");
  });
});
