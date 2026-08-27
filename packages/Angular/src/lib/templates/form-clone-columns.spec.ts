/**
 * Drift guard: every column a cloned row should carry is actually carried.
 *
 * `FormCloneService` copies each child row by hand-listing its columns (`copy.X = source.X`),
 * which is the right shape — a clone must NOT copy `ID`, the re-pointed `FormID`, or the
 * framework timestamps, so "copy everything" is wrong. The cost of hand-listing is that a
 * column added later is simply forgotten, silently, and the clone quietly means something
 * different from the form it was cloned from.
 *
 * That is not hypothetical. `FormScreen.IsDisqualification` shipped in this same feature and
 * was not added here: cloning a form (or instantiating it as a template — both routes go
 * through this service) downgraded every knockout screen to an ordinary conditional ending. The
 * rule still matched, so the respondent still saw the "not eligible" copy — but the response
 * persisted as `Complete` with `SubmittedAt` set, consumed a quota slot, and fired every
 * on-submit automation, which is exactly the state the disqualification feature exists to
 * prevent. Nothing in the suite touched this file.
 *
 * So the guard is generated from the ORM layer rather than from a list somebody maintains: the
 * settable properties of each generated entity class, minus an EXPLICIT exclusion list that has
 * to state why. A new column fails this spec until it is either copied or deliberately excluded.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLONE_SERVICE = readFileSync(join(__dirname, 'form-clone.service.ts'), 'utf8');
/**
 * The ORM layer, read from the sibling package's SOURCE rather than its build output: this
 * guard's whole point is to notice a column the moment CodeGen emits it, and `dist/` may be
 * stale or absent. `.claude/rules/data-access.md` names this file as the ground truth for
 * schema — deriving the guard from anything else would just be a second list to forget.
 */
const ENTITY_SUBCLASSES = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'Entities', 'src', 'generated', 'entity_subclasses.ts'),
  'utf8',
);

/**
 * Columns no clone may carry, and why. Split per reason rather than one flat list, because
 * "this is a new primary key" and "this row now belongs to a different form" are different
 * decisions and a future reader needs to be able to tell which applies.
 */
const NEVER_COPIED: ReadonlyArray<{ column: string; because: string }> = [
  { column: 'ID', because: 'the copy is a new row with a new primary key' },
  { column: 'FormID', because: 'the copy belongs to the NEW form, set explicitly' },
  { column: 'PageID', because: 're-pointed to the copied page via the id map' },
  { column: 'QuestionID', because: 're-pointed to the copied question via the id map' },
  { column: 'FormEntityBindingID', because: 're-pointed to the copied binding via the id map' },
  { column: '__mj_CreatedAt', because: 'framework timestamp, written by the database' },
  { column: '__mj_UpdatedAt', because: 'framework timestamp, written by the database' },
];

const EXCLUDED = new Set(NEVER_COPIED.map((e) => e.column));

/** The child rows this service clones, paired with the generated class that defines their columns. */
const CLONED_CHILDREN: ReadonlyArray<{ copier: string; entityClass: string }> = [
  { copier: 'copyPages', entityClass: 'mjBizAppsFormsFormPageEntity' },
  { copier: 'copyQuestions', entityClass: 'mjBizAppsFormsFormQuestionEntity' },
  { copier: 'copyOptions', entityClass: 'mjBizAppsFormsFormQuestionOptionEntity' },
  { copier: 'copyScreens', entityClass: 'mjBizAppsFormsFormScreenEntity' },
  { copier: 'copyBindings', entityClass: 'mjBizAppsFormsFormEntityBindingEntity' },
  { copier: 'copyAutomations', entityClass: 'mjBizAppsFormsFormAutomationEntity' },
];

/** The settable column names of one generated entity class. */
function settableColumns(entityClass: string): string[] {
  const start = ENTITY_SUBCLASSES.indexOf(`export class ${entityClass} `);
  expect(start, `generated class ${entityClass} not found`).toBeGreaterThan(-1);
  const nextClass = ENTITY_SUBCLASSES.indexOf('\nexport class ', start + 1);
  const body = ENTITY_SUBCLASSES.slice(start, nextClass === -1 ? undefined : nextClass);
  const names = new Set<string>();
  for (const match of body.matchAll(/^\s{4}set ([A-Za-z_][A-Za-z0-9_]*)\(/gm)) {
    names.add(match[1]);
  }
  return [...names];
}

/** The body of one `copy*` method of the clone service. */
function copierBody(copier: string): string {
  const start = CLONE_SERVICE.indexOf(`private async ${copier}(`);
  expect(start, `${copier} not found in form-clone.service.ts`).toBeGreaterThan(-1);
  const body = CLONE_SERVICE.slice(start);
  // The method's closing brace, which is `\n  }` followed by a NEWLINE. Matching `\n  }` alone
  // also hits the `  }>` that closes a multi-line `Promise<{...}>` return type, truncating the
  // body to nothing and reporting every column as missing.
  const end = body.indexOf('\n  }\n');
  return body.slice(0, end);
}

describe('cloning carries every column it should', () => {
  it('reads a real column list out of the generated entities', () => {
    // If this ever finds nothing, every assertion below passes vacuously.
    expect(settableColumns('mjBizAppsFormsFormScreenEntity')).toContain('IsDisqualification');
  });

  for (const { copier, entityClass } of CLONED_CHILDREN) {
    it(`${copier} copies every settable column of ${entityClass}`, () => {
      const body = copierBody(copier);
      const missing = settableColumns(entityClass)
        .filter((column) => !EXCLUDED.has(column))
        .filter((column) => !new RegExp(`copy\\.${column}\\s*=`).test(body));

      expect(
        missing,
        `${copier} does not carry ${missing.join(', ')} — copy ${missing.length === 1 ? 'it' : 'them'}, ` +
          'or add to NEVER_COPIED with the reason',
      ).toEqual([]);
    });
  }
});
