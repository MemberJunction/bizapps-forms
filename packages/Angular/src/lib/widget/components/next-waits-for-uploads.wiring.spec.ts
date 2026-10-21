/**
 * Next waits for the step's uploads before judging it (#248), in both render modes.
 *
 * Neither renderer can be instantiated in this suite's node environment (`input.required` plus
 * constructor effects — see `scroll-stepper.wiring.spec.ts`), so the behaviour is tested for real
 * where it lives: `core/settled-validation.spec.ts` drives `judgeWhenSettled` and `StepJudge`
 * against a real `FormRuntime` and `FormUploadStore`, double tap and Back-during-the-wait
 * included. What is left to prove here is that each renderer ASKS the judge, in the right order,
 * and acts on nothing when the verdict is stale.
 *
 * Comments are stripped before every assertion: the source explains these decisions in prose,
 * and a guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

/** The body of one method, from its declaration to its closing brace. */
function methodBody(src: string, declaration: string): string {
  const start = src.indexOf(declaration);
  expect(start, `${declaration} not found`).toBeGreaterThan(-1);
  const body = src.slice(start);
  return body.slice(0, body.indexOf('\n  }\n'));
}

/** `body` contains `first` and, after it, `then`. */
function expectInOrder(body: string, first: RegExp, then: RegExp): void {
  const a = body.search(first);
  expect(a, `${first} not found`).toBeGreaterThan(-1);
  const b = body.slice(a).search(then);
  expect(b, `${then} not found after ${first}`).toBeGreaterThan(-1);
}

describe.each([
  ['form-scroll.component.ts', 'Scroll'],
  ['form-one-question.component.ts', 'OneQuestion'],
])('%s — the renderer owns one judge over its own store', (file) => {
  const src = (): string => stripped(file);

  it('injects the widget’s upload store rather than creating one', () => {
    // MjFormComponent provides the store; a renderer creating its own would wait on uploads
    // nobody starts.
    expect(src()).toMatch(/inject\(FormUploadStore\)/);
    expect(src()).not.toMatch(/new FormUploadStore\(/);
  });

  it('keys the judge on the step on screen', () => {
    expect(src()).toMatch(/new StepJudge\(\s*inject\(FormUploadStore\),\s*\(\) => this\.current\(\)\?\.id \?\? null,?\s*\)/);
  });
});

describe('Scroll — Next waits for the section’s uploads', () => {
  const src = (): string => stripped('form-scroll.component.ts');
  const onNext = (): string => methodBody(src(), 'protected async onNext');
  const onSubmit = (): string => methodBody(src(), 'protected async onSubmit');

  it('commits what the respondent sees BEFORE waiting', () => {
    // The DOM read is about this moment; after the wait the respondent may be elsewhere.
    expectInOrder(onNext(), /commitVisibleValues\(\)/, /await /);
  });

  it('judges the section being left through the judge, not synchronously', () => {
    const body = onNext();
    expect(body).toMatch(/await this\.stepJudge\.judge\(this\.runtime\(\), questions\)/);
    expect(body).not.toMatch(/touchAll\(|areValid\(/);
  });

  it('acts on nothing when the verdict is stale, and advances only on a valid one', () => {
    const body = onNext();
    expectInOrder(body, /await this\.stepJudge\.judge/, /=== 'stale'\)\s*\{\s*return;/);
    expectInOrder(body, /=== 'stale'/, /setIndex\(this\.index\(\) \+ 1\)/);
    expectInOrder(body, /=== 'invalid'\)\s*\{\s*this\.focusFirstInvalidIn\(questions\);\s*return;/, /setIndex\(/);
  });

  it('on the last section still just hands over to the submit', () => {
    // mj-form's onSubmit already waits for every visible question's upload (restarting a spent
    // one and refusing on a failed one), so a wait here would only repeat that wait.
    expect(onNext()).toMatch(/isLast\(\)\)\s*\{\s*this\.submit\.emit\(\);\s*return;/);
  });

  it('a submit on the last section waits, then judges the whole visible form', () => {
    const body = onSubmit();
    expectInOrder(body, /preventDefault\(\)/, /await /);
    expectInOrder(body, /stopPropagation\(\)/, /await /);
    expectInOrder(body, /commitVisibleValues\(\)/, /await /);
    expect(body).toMatch(/const all = this\.runtime\(\)\.visibleAnswerableQuestions\(\)/);
    expect(body).toMatch(/await this\.stepJudge\.judge\(this\.runtime\(\), all\)/);
    expect(body).not.toMatch(/touchAll\(|areValid\(/);
    expectInOrder(body, /=== 'stale'\)\s*\{\s*return;/, /this\.submit\.emit\(\)/);
  });

  it('focuses a failed upload as well as an invalid answer — the judge decides what is a problem', () => {
    // The judge refuses a question whose upload failed even when it has no validation error (an
    // optional drawing), and leaves it untouched so "required" does not contradict the quiet
    // failure line. Finding the target with `errorFor` alone would refuse and then focus nothing.
    for (const method of ['private focusFirstInvalidIn', 'private revealFirstInvalid']) {
      const body = methodBody(src(), method);
      expect(body).toMatch(/this\.stepJudge\.firstProblemIn\(this\.runtime\(\), questions\)/);
      expect(body).not.toMatch(/errorFor\(/);
    }
  });
});

describe('OneQuestion — Next waits for the question’s upload', () => {
  const src = (): string => stripped('form-one-question.component.ts');
  const onNext = (): string => methodBody(src(), 'protected async onNext');

  it('commits what the respondent sees BEFORE waiting', () => {
    expectInOrder(onNext(), /commitVisibleValues\(\)/, /await /);
  });

  it('judges the current question through the judge, and touches nothing before the wait', () => {
    const body = onNext();
    expect(body).toMatch(/await this\.stepJudge\.judge\(this\.runtime\(\), \[q\]\)/);
    // Touching is what shows "required"; doing it before the upload lands is the #248 bug.
    const beforeWait = body.slice(0, body.indexOf('await '));
    expect(beforeWait).not.toMatch(/markTouched\(|touchAll\(|errorFor\(/);
  });

  it('acts on nothing when the verdict is stale', () => {
    expectInOrder(onNext(), /await this\.stepJudge\.judge/, /=== 'stale'\)\s*\{\s*return;/);
  });

  it('is held by an invalid verdict OR a server refusal, deciding after the wait', () => {
    // `areValid` (inside the verdict) ignores server refusals, which have always held this step,
    // so `errorFor` stays. The verdict is needed too: a failed upload on an optional question has
    // no `errorFor`, and only the verdict knows it must not be advanced past.
    const body = onNext();
    expectInOrder(
      body,
      /=== 'stale'/,
      /if \(verdict === 'invalid' \|\| this\.runtime\(\)\.errorFor\(q\)\)\s*\{\s*this\.focusCurrent\(\);\s*return;/,
    );
    expectInOrder(body, /errorFor\(q\)/, /isLast\(\)/);
    expectInOrder(body, /errorFor\(q\)/, /this\.submit\.emit\(\)/);
    expectInOrder(body, /errorFor\(q\)/, /setIndex\(this\.index\(\) \+ 1\)/);
  });

  it('Enter does not leave the waiting promise floating unmarked', () => {
    expect(methodBody(src(), 'protected onKeydown')).toMatch(/void this\.onNext\(\)/);
  });
});
