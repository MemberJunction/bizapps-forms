/**
 * Structural guard: every ARIA idref in the question template points at an element that binds
 * that id IN THE SAME BRANCH of the type switch.
 *
 * The defect this pins (#117): the eight grouped controls — SingleChoice, MultiChoice, Rating,
 * NPS, YesNo, PictureChoice, OpinionScale, Legal — bound `aria-labelledby` to `inputId()`, the id
 * of the *control*. That expression IS bound as `[id]` in the template, on the native controls in
 * other `@case` branches, so "is this id bound somewhere?" was true while every group rendered
 * with `aria-labelledby` pointing at nothing. A screen reader heard "1 of 5, radio button" with no
 * question, and on Legal an unnamed Yes/No — a consent control whose question was inaudible.
 * The fix gives the shared `<label>` an id (`labelId()`) and names the groups by it, so grouped
 * and native controls compute the same accessible name from the same element.
 *
 * `FormQuestionComponent` uses signal inputs and `inject()` and cannot be rendered in this
 * suite's node environment (JIT cannot see signal inputs without Angular's compile-time
 * transform), so what is checkable is the template text: each `@case` / `@default` block and
 * each `<ng-template>` is a branch, everything else is shared. A direct reference such as
 * `labelId()` must be bound as `[id]` in its own branch or in the shared region. `describedBy()`
 * is a composite whose members are each runtime-gated inside the computed (`statusId()` only
 * ever joins it for a FileUpload), so its members need only be bound somewhere in the template
 * — the live DOM check for that runs in the smoke test. HTML comments are stripped before every
 * assertion: the template explains this same decision in prose, and a guard that matches its
 * own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORM_QUESTION_TYPES, isAnswerableQuestionType } from '@mj-biz-apps/forms-entities';

const template = readFileSync(join(__dirname, 'form-question.component.html'), 'utf8').replace(
  /<!--[\s\S]*?-->/g,
  '',
);
const component = readFileSync(join(__dirname, 'form-question.component.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

/** The types whose control is a group of buttons rather than one native element. */
const GROUPED_TYPES = ['SingleChoice', 'MultiChoice', 'Rating', 'NPS', 'YesNo', 'PictureChoice', 'OpinionScale', 'Legal'];

/** Index of the `}` closing the block whose `{` sits just before `from`. Interpolations are balanced too. */
function closingBrace(text: string, from: number): number {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  throw new Error(`unbalanced braces after offset ${from}`);
}

/** Every `@case ('X') { … }` / `@default { … }` body keyed by type, and every `<ng-template #x>` body by `#x`. */
function branchesOf(html: string): Map<string, string> {
  const branches = new Map<string, string>();
  const opener = /@(?:case \('(\w+)'\)|default)\s*\{/g;
  for (let m = opener.exec(html); m; m = opener.exec(html)) {
    const end = closingBrace(html, opener.lastIndex);
    branches.set(m[1] ?? 'default', html.slice(opener.lastIndex, end));
    opener.lastIndex = end;
  }
  for (const m of html.matchAll(/<ng-template #(\w+)>([\s\S]*?)<\/ng-template>/g)) {
    branches.set(`#${m[1]}`, m[2]);
  }
  return branches;
}

const branches = branchesOf(template);
/** The template with every branch body removed — what renders for every type. */
const shared = [...branches.values()].reduce((rest, body) => rest.replace(body, ''), template);

/** `[attr.aria-labelledby]` / `[attr.aria-describedby]` bindings in a piece of template. */
function idrefsIn(html: string): Array<{ attr: string; expression: string }> {
  return [...html.matchAll(/\[attr\.(aria-labelledby|aria-describedby)\]="([^"]+)"/g)].map((m) => ({
    attr: m[1],
    expression: m[2],
  }));
}

/** Expressions bound as `[id]` in a piece of template. */
function idsBoundIn(html: string): Set<string> {
  return new Set([...html.matchAll(/\[id\]="([^"]+)"/g)].map((m) => m[1]));
}

/** The id expressions `describedBy()` can join: every `ids.push(this.X())` in the computed. */
const describedByMembers = [...component.matchAll(/ids\.push\(this\.(\w+)\(\)\)/g)].map((m) => `${m[1]}()`);

/** The id-producing calls an idref expression can evaluate to (`a ? x() : null` → `x()`). */
function producersOf(expression: string): string[] {
  return [...expression.matchAll(/\w+\([^()]*\)/g)].map((m) => m[0]);
}

describe('every ARIA idref in the question template resolves within its own branch', () => {
  it('reads the describedBy members out of the component, so the expansion cannot rot silently', () => {
    expect(describedByMembers).toEqual(['helpId()', 'errorId()', 'statusId()']);
  });

  it('gives the shared label the id that grouped controls are named by, with the prompt inside it', () => {
    expect(shared).toMatch(/<label class="mjf-question__label" \[id\]="labelId\(\)"[^>]*>\s*<span class="mjf-question__prompt">\{\{ q\.prompt \}\}<\/span>/);
  });

  it.each([...branches.keys()])('%s: every aria-labelledby / aria-describedby target is bound as [id] in scope', (branch) => {
    const body = branches.get(branch)!;
    const inScope = new Set([...idsBoundIn(shared), ...idsBoundIn(body)]);
    const anywhere = idsBoundIn(template);
    for (const { attr, expression } of idrefsIn(body)) {
      for (const producer of producersOf(expression)) {
        if (producer === 'describedBy()') {
          for (const member of describedByMembers) {
            expect(anywhere, `${branch}: ${attr}="${expression}" can yield ${member}, bound as [id] nowhere`).toContain(member);
          }
        } else {
          expect(inScope, `${branch}: ${attr}="${expression}" points at ${producer}, bound as [id] neither here nor in the shared region`).toContain(producer);
        }
      }
    }
  });

  it('names exactly the grouped controls by aria-labelledby', () => {
    const named = [...branches].filter(([, body]) => idrefsIn(body).some((r) => r.attr === 'aria-labelledby')).map(([name]) => name);
    expect(named.sort()).toEqual([...GROUPED_TYPES].sort());
  });

  it('walks the whole answerable catalog: every explicit case is a real type, and the rest fall to a native @default control', () => {
    const cases = [...branches.keys()].filter((name) => !name.startsWith('#') && name !== 'default');
    for (const name of cases) {
      expect(FORM_QUESTION_TYPES, `@case ('${name}') is not a question type`).toContain(name);
    }
    const defaulted = FORM_QUESTION_TYPES.filter((type) => isAnswerableQuestionType(type) && !cases.includes(type));
    expect(defaulted.length).toBeGreaterThan(0);
    expect(idsBoundIn(branches.get('default')!)).toContain('inputId()');
  });
});
