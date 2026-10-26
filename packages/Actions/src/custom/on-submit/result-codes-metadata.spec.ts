/**
 * Pins the `MJ: Action Result Codes` metadata of the four on-submit actions to the codes their
 * sources return (F14).
 *
 * MJ's ActionEngine records `ResultCode` in `ActionExecutionLog` only when it finds a matching
 * result-code row in metadata; an undeclared code is logged as NULL, with no error. So a code added
 * to an action's source without a metadata row (or a row left behind after the code is removed)
 * fails silently in production, and this spec is the only thing that notices.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ACTIONS_JSON = fileURLToPath(new URL('../../../../../metadata/actions/.actions.json', import.meta.url));
const RESULT_CODES = 'MJ: Action Result Codes';

/** Metadata action name -> its source file. */
const ON_SUBMIT_ACTIONS: Record<string, string> = {
  'Forms: Upsert Respondent Person': 'upsert-respondent-person.action.ts',
  'Forms: Send Confirmation Email': 'send-confirmation-email.action.ts',
  'Forms: Create Followup Task': 'create-followup-task.action.ts',
  'Forms: Analyze Written Responses': 'analyze-written-responses.action.ts',
};

/** The ways these sources produce a code: `ResultCode: 'X'`, a ternary after it, `fail(msg, 'X')`. */
function codesReturnedBy(source: string): Set<string> {
  const codes = new Set<string>();
  for (const m of source.matchAll(/ResultCode:\s*(?:[^'\n,]*\?\s*)?'([A-Z_]+)'(?:\s*:\s*'([A-Z_]+)')?/g)) {
    codes.add(m[1]);
    if (m[2]) codes.add(m[2]);
  }
  for (const m of source.matchAll(/,\s*'([A-Z_]+)',?\s*\)/g)) {
    codes.add(m[1]);
  }
  return codes;
}

interface ResultCodeFields {
  ResultCode: string;
  IsSuccess: boolean;
}

interface ActionRecord {
  fields: { Name: string };
  relatedEntities?: Record<string, { fields: ResultCodeFields }[]>;
}

function declaredCodes(): Map<string, ResultCodeFields[]> {
  const records = JSON.parse(readFileSync(ACTIONS_JSON, 'utf8')) as ActionRecord[];
  return new Map(records.map((r) => [r.fields.Name, (r.relatedEntities?.[RESULT_CODES] ?? []).map((c) => c.fields)]));
}

describe('on-submit action result codes', () => {
  const declared = declaredCodes();

  for (const [actionName, file] of Object.entries(ON_SUBMIT_ACTIONS)) {
    describe(actionName, () => {
      const returned = codesReturnedBy(readFileSync(`${HERE}${file}`, 'utf8'));
      const rows = declared.get(actionName) ?? [];
      const declaredNames = new Set(rows.map((r) => r.ResultCode));

      it('finds codes in the source (the extractor still matches the source style)', () => {
        expect(returned.size).toBeGreaterThan(0);
      });

      it('declares every code the source returns', () => {
        expect([...returned].filter((c) => !declaredNames.has(c)).sort()).toEqual([]);
      });

      it('declares no code the source never returns', () => {
        expect([...declaredNames].filter((c) => !returned.has(c)).sort()).toEqual([]);
      });

      it('declares each code once, and marks only SUCCESS and SKIPPED as successes', () => {
        expect(rows.length).toBe(declaredNames.size);
        for (const row of rows) {
          expect(row.IsSuccess, row.ResultCode).toBe(row.ResultCode === 'SUCCESS' || row.ResultCode === 'SKIPPED');
        }
      });
    });
  }
});
