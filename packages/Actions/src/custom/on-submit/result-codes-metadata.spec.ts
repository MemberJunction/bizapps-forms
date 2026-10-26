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

/** Index just past the string/template literal that opens at `start`. Template `${}` is skipped as opaque. */
function skipLiteral(src: string, start: number): number {
  const quote = src[start];
  let i = start + 1;
  while (i < src.length && src[i] !== quote) {
    i += src[i] === '\\' ? 2 : 1;
  }
  return i + 1;
}

/** The text of the last argument of the call whose `(` is at `open`, or undefined if unbalanced. */
function lastArgumentOf(src: string, open: number): string | undefined {
  let depth = 0;
  let argStart = open + 1;
  let lastNonEmpty = '';
  for (let i = open; i < src.length; ) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipLiteral(src, i);
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        const tail = src.slice(argStart, i).trim();
        return tail || lastNonEmpty;
      }
    }
    if (c === ',' && depth === 1) {
      lastNonEmpty = src.slice(argStart, i).trim() || lastNonEmpty;
      argStart = i + 1;
    }
    i++;
  }
  return undefined;
}

/** `Success: true|false` of the object literal a `ResultCode:` at `at` belongs to (nearest preceding one in its `return`). */
function successBefore(src: string, at: number): boolean | undefined {
  const statement = src.slice(Math.max(0, src.lastIndexOf('return', at)), at);
  const all = [...statement.matchAll(/Success:\s*(true|false)/g)];
  const last = all[all.length - 1];
  return last ? last[1] === 'true' : undefined;
}

/**
 * Every code a source returns, with the `Success` value it is returned together with. Throws, naming
 * the file and the text, on any shape it cannot read: a partly blind extractor would let a code slip
 * past the pin without a failure.
 */
function codesReturnedBy(file: string, source: string): Map<string, Set<boolean>> {
  const codes = new Map<string, Set<boolean>>();
  const add = (code: string, success: boolean): void => {
    codes.set(code, (codes.get(code) ?? new Set<boolean>()).add(success));
  };

  for (const m of source.matchAll(/ResultCode:\s*/g)) {
    const at = m.index ?? 0;
    const rest = source.slice(at + m[0].length);
    const literal = /^'([A-Z_]+)'/.exec(rest);
    const ternary = /^[^'\n?:]+\?\s*'([A-Z_]+)'\s*:\s*'([A-Z_]+)'/.exec(rest);
    if (/^resultCode\b/.test(rest)) continue; // the `fail` helper forwarding its parameter; callers are checked below
    const found = literal ? [literal[1]] : ternary ? [ternary[1], ternary[2]] : undefined;
    if (!found) {
      throw new Error(`${file}: cannot read the value after "ResultCode:" in: ${rest.slice(0, 60).split('\n')[0]}`);
    }
    const success = successBefore(source, at);
    if (success === undefined) {
      throw new Error(`${file}: no "Success: true|false" before "ResultCode: ${found.join(' / ')}"`);
    }
    found.forEach((c) => add(c, success));
  }

  for (const m of source.matchAll(/(?<!function\s)\bfail\(/g)) {
    const arg = lastArgumentOf(source, (m.index ?? 0) + m[0].length - 1);
    const literal = arg ? /^'([A-Z_]+)'$/.exec(arg) : null;
    if (!literal) {
      throw new Error(`${file}: the last argument of a fail( call is not a string-literal code: ${arg ?? '(unbalanced call)'}`);
    }
    add(literal[1], false);
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
      const returned = codesReturnedBy(file, readFileSync(`${HERE}${file}`, 'utf8'));
      const rows = declared.get(actionName) ?? [];
      const declaredNames = new Set(rows.map((r) => r.ResultCode));

      it('finds codes in the source (the extractor still matches the source style)', () => {
        expect(returned.size).toBeGreaterThan(0);
      });

      it('declares every code the source returns', () => {
        expect([...returned.keys()].filter((c) => !declaredNames.has(c)).sort()).toEqual([]);
      });

      it('declares no code the source never returns', () => {
        expect([...declaredNames].filter((c) => !returned.has(c)).sort()).toEqual([]);
      });

      it('declares each code once', () => {
        expect(rows.length).toBe(declaredNames.size);
      });

      it('returns no code both with Success true and with Success false', () => {
        const ambiguous = [...returned].filter(([, successes]) => successes.size > 1).map(([code]) => code);
        expect(ambiguous).toEqual([]);
      });

      it('marks IsSuccess as the Success value the action returns with that code', () => {
        for (const row of rows) {
          const successes = returned.get(row.ResultCode);
          if (!successes || successes.size !== 1) continue; // reported by the two checks above
          expect(row.IsSuccess, `${actionName}: ${row.ResultCode}`).toBe([...successes][0]);
        }
      });
    });
  }
});
