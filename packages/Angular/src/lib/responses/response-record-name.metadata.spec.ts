/**
 * A form response has a record name.
 *
 * `MJ_BizApps_Forms: Form Responses` had no name field, so MJ's record-name lookup returned
 * nothing for every response, and Explorer reported "Name for record … not found, could be an
 * access issue" three times each time a response opened (click-through observation 1). The name is
 * the form's own name, the view's `Form` column: it is present on every response, where the
 * respondent's name is null for an anonymous one.
 *
 * The flag is pinned against CodeGen (`AutoUpdateIsNameField: false`), and the three foreign keys
 * that point at a response stop asking for its name in their own views. Left on, the next CodeGen
 * run would add a join to `vwFormResponses` in three views — a schema change, with its migration,
 * for a column nobody reads.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface FieldRecord {
  primaryKey: { ID: string };
  fields: Record<string, unknown>;
}
interface EntityRecord {
  primaryKey: { ID: string };
  relatedEntities?: { 'MJ: Entity Fields'?: FieldRecord[] };
}

const ENTITIES = join(__dirname, '../../../../../metadata/entities/.entities.json');
const entity = (name: string): EntityRecord | undefined =>
  (JSON.parse(readFileSync(ENTITIES, 'utf8')) as EntityRecord[]).find(
    (e) => e.primaryKey.ID === `@lookup:MJ: Entities.Name=${name}`,
  );
const field = (entityName: string, fieldName: string): Record<string, unknown> | undefined =>
  entity(entityName)?.relatedEntities?.['MJ: Entity Fields']?.find(
    (f) => f.primaryKey.ID === `@lookup:MJ: Entity Fields.Name=${fieldName}&EntityID=@parent:ID`,
  )?.fields;

describe('a form response has a record name', () => {
  it("is named by its form's name, and CodeGen may not take the flag away", () => {
    expect(field('MJ_BizApps_Forms: Form Responses', 'Form')).toMatchObject({
      IsNameField: true,
      AutoUpdateIsNameField: false,
    });
  });

  it.each([
    ['MJ_BizApps_Forms: Form Response Answers', 'ResponseID'],
    ['MJ_BizApps_Forms: Form Automation Runs', 'FormResponseID'],
    ['MJ_BizApps_Forms: Form Entity Binding Records', 'FormResponseID'],
  ])('leaves the %s view without a response-name join (%s)', (entityName, fkName) => {
    expect(field(entityName, fkName)).toMatchObject({ IncludeRelatedEntityNameFieldInBaseView: false });
  });
});
