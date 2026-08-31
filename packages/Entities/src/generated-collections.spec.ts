/**
 * The three owned collections CodeGen emits from `EntityRelationship.RelatedRecordCollection`.
 *
 * Asserted because the declaration is GENERATED: it exists only as long as the metadata row does.
 * A database that never received the seed — or a regeneration against one — produces a file with no
 * collections at all, and nothing fails at build time. The loss would surface much later and
 * somewhere else: server-side callers that rely on `page.Delete()` cascading would quietly stop
 * cascading, and `form-clone` would go back to copying a form one row at a time. This test is what
 * turns that silence into a red suite.
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
function declarationFor(name: string): string {
  const match = new RegExp(
    `public readonly ${name} = this\\.DeclareRelatedRecords<[^>]+>\\(\\{([\\s\\S]*?)\\}\\);`,
  ).exec(GENERATED);
  if (!match) {
    throw new Error(
      `No DeclareRelatedRecords('${name}') in the generated entities. Either the ` +
        `EntityRelationship metadata is missing from this database, or CodeGen ran against one ` +
        `that never received it — see metadata/entity-relationships/.`,
    );
  }
  return match[1].replace(/\s+/g, ' ').trim();
}

describe('Form.Pages', () => {
  it('joins on FormID, ordered by DisplayOrder, and owns its children', () => {
    const pages = declarationFor('Pages');
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
    expect(declarationFor('Pages')).toContain("Sequence: { Field: 'DisplayOrder', From: 0 }");
  });
});

describe('FormPage.Questions', () => {
  it('joins on PageID, not FormID', () => {
    const questions = declarationFor('Questions');
    expect(questions).toContain("RelatedEntityJoinField: 'PageID'");
    expect(questions).toContain("RelatedEntity: 'MJ_BizApps_Forms: Form Questions'");
    expect(questions).toContain("OnRemove: 'delete'");
  });
});

describe('FormQuestion.Options', () => {
  it('joins on QuestionID and owns its children', () => {
    const options = declarationFor('Options');
    expect(options).toContain("RelatedEntityJoinField: 'QuestionID'");
    expect(options).toContain("RelatedEntity: 'MJ_BizApps_Forms: Form Question Options'");
    expect(options).toContain("OnRemove: 'delete'");
  });
});
