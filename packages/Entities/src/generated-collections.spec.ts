/**
 * The three owned collections CodeGen emits from `EntityRelationship.RelatedRecordCollection`.
 *
 * Asserted because the declaration is GENERATED: it exists only as long as the metadata row does.
 * Regenerate against a database that never received the seed and the collections silently vanish
 * from this file, with nothing failing at build time — because nothing consumes them yet. That is
 * the honest scope of this test: it guards the CHECKED-IN generated output against a regeneration
 * that quietly drops the declarations, so the loss shows up as a red suite in the PR that caused it
 * rather than in the first feature that goes looking for a collection and finds none. It cannot
 * tell you the seed reached any host — the shipped package carries whatever is committed here.
 *
 * READ AS TEXT, not by constructing the entity. `new mjBizAppsFormsFormEntity()` reaches
 * `EntityInfo.AssertEntityActiveStatus` in `BaseEntity`'s constructor and needs a live metadata
 * provider, which no unit test in this repo has. The subject here is the generated SOURCE anyway —
 * "did CodeGen write the declaration, and with which join field" — so reading it is not a
 * workaround, it is the question stated directly.
 *
 * The join fields are the substance. `MJ_BizApps_Forms: Forms` has relationships to BOTH Form Pages
 * and Form Questions on `FormID`, so a `Questions` collection keyed there instead of on `PageID`
 * would put every question in the form on every page — a wrong answer that looks plausible.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const GENERATED = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'generated', 'entity_subclasses.ts'),
  'utf8',
);

/**
 * The body of one `DeclareRelatedRecords({...})` call, whitespace-normalised.
 *
 * Normalised so an assertion pins the CONFIGURATION rather than CodeGen's indentation, which has
 * changed before and carries no meaning.
 */
function declarationFor(owner: string, name: string): string {
  const body = classBodyOf(owner);
  const match = new RegExp(
    `public readonly ${name} = this\\.DeclareRelatedRecords<[^>]+>\\(\\{([\\s\\S]*?)\\}\\);`,
  ).exec(body);
  if (!match) {
    throw new Error(
      `No DeclareRelatedRecords('${name}') on ${owner}. Either the EntityRelationship metadata is ` +
        `missing from this database, CodeGen ran against one that never received it, or the ` +
        `collection was emitted onto a DIFFERENT entity — see metadata/entity-relationships/.`,
    );
  }
  return match[1].replace(/\s+/g, ' ').trim();
}

/**
 * The source of one generated entity class, so a declaration is attributed to its OWNER.
 *
 * Searching the whole file cannot tell `FormPage.Questions` from `Form.Questions`, and that is the
 * single most likely way for this metadata to be wrong: `MJ_BizApps_Forms: Forms` relates to both
 * Form Pages and Form Questions, so a lookup that resolves to the wrong relationship emits a
 * plausible-looking `Questions` collection on the form instead of the page — putting every question
 * in the form on every page. An unanchored assertion passes on exactly that mistake.
 */
function classBodyOf(owner: string): string {
  const start = GENERATED.indexOf(`export class ${owner} extends BaseEntity`);
  if (start === -1) {
    throw new Error(`No generated class ${owner} — has CodeGen's class naming changed?`);
  }
  const next = GENERATED.indexOf('\nexport class ', start + 1);
  return GENERATED.slice(start, next === -1 ? GENERATED.length : next);
}

describe('Form.Pages', () => {
  it('joins on FormID, ordered by DisplayOrder, and owns its children', () => {
    const pages = declarationFor('mjBizAppsFormsFormEntity', 'Pages');
    expect(pages).toContain("RelatedEntity: 'MJ_BizApps_Forms: Form Pages'");
    expect(pages).toContain("RelatedEntityJoinField: 'FormID'");
    expect(pages).toContain("OrderBy: 'DisplayOrder ASC'");
    expect(pages).toContain("OnRemove: 'delete'");
    expect(pages).toContain("Load: 'explicit'");
    expect(pages).toContain('ReadOnly: false');
  });

  it('sequences from 0, matching every DisplayOrder already stored', () => {
    // `From: 1` is the framework default. Taking it would mark every page, question and option in
    // every form dirty on the first reorder and rewrite the lot.
    expect(declarationFor('mjBizAppsFormsFormEntity', 'Pages')).toContain(
      "Sequence: { Field: 'DisplayOrder', From: 0 }",
    );
  });
});

describe('FormPage.Questions', () => {
  it('joins on PageID, not FormID, and hangs off the PAGE', () => {
    // The owner is half the assertion: `Questions` emitted onto the form rather than the page is
    // the failure this whole declaration exists to avoid, and it reads as correct from a distance.
    const questions = declarationFor('mjBizAppsFormsFormPageEntity', 'Questions');
    expect(questions).toContain("RelatedEntityJoinField: 'PageID'");
    expect(questions).toContain("RelatedEntity: 'MJ_BizApps_Forms: Form Questions'");
    expect(questions).toContain("OnRemove: 'delete'");
    expect(questions).toContain("Load: 'explicit'");
    expect(questions).toContain('ReadOnly: false');
    // Same reason as Pages: `From: 1` would renumber every question in every form on first drag.
    expect(questions).toContain("Sequence: { Field: 'DisplayOrder', From: 0 }");
  });
});

/**
 * One field's declaration line out of a generated zod schema.
 *
 * Read from the schema rather than the DDL because the schema is what the shipped package carries
 * — a caller in another repo has these types and not `migrations/`.
 */
function schemaField(schema: string, field: string): string {
  const start = GENERATED.indexOf(`export const ${schema} = z.object({`);
  if (start === -1) {
    throw new Error(`No generated schema ${schema} — has CodeGen's naming changed?`);
  }
  const line = new RegExp(`^\\s+${field}: (.*)$`, 'm').exec(GENERATED.slice(start));
  if (!line) {
    throw new Error(`No field ${field} on ${schema}.`);
  }
  return line[1];
}

describe('FormPage.Questions is safe to read and a TRAP to Create() through', () => {
  it('keys on PageID while FormID is required, so a created child cannot be saved', () => {
    // The hazard this collection ships with, pinned so the first caller to adopt it meets it here
    // rather than at a save refusal they have to reverse-engineer.
    //
    // `RelatedRecordCollection.Create()` calls `NewRecord()` and then `Add()`, and the only column
    // `Add` writes is the JOIN FIELD (core's `stampParentKey` sets `RelatedEntityJoinField` and
    // nothing else). So a question created through `page.Questions` gets `PageID` and NOT
    // `FormID` — which is NOT NULL, is not derived by any hook on either tier, and is not
    // reachable from the page through the collection. Every write path in the builder sets it by
    // hand (`addQuestion` uses `tree.form.ID`), which is why nothing has hit this yet.
    //
    // READING the collection is unaffected: the join is correct, and every loaded row already has
    // its FormID from the database.
    expect(declarationFor('mjBizAppsFormsFormPageEntity', 'Questions')).toContain(
      "RelatedEntityJoinField: 'PageID'",
    );
    expect(schemaField('mjBizAppsFormsFormQuestionSchema', 'FormID')).not.toContain('.nullable()');
    // The other half of the trap: PageID is NULLABLE, so a question can belong to a form and no
    // page. The collection is a partial view of the form's questions, not all of them.
    expect(schemaField('mjBizAppsFormsFormQuestionSchema', 'PageID')).toContain('.nullable()');
  });
});

describe('FormQuestion.Options', () => {
  it('joins on QuestionID and owns its children', () => {
    const options = declarationFor('mjBizAppsFormsFormQuestionEntity', 'Options');
    expect(options).toContain("RelatedEntityJoinField: 'QuestionID'");
    expect(options).toContain("RelatedEntity: 'MJ_BizApps_Forms: Form Question Options'");
    expect(options).toContain("OnRemove: 'delete'");
    expect(options).toContain("Load: 'explicit'");
    expect(options).toContain('ReadOnly: false');
    expect(options).toContain("Sequence: { Field: 'DisplayOrder', From: 0 }");
  });
});
