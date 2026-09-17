/**
 * That the builder actually USES the targeting rule, and that the canvas marks what it picks.
 *
 * WHY THIS SPEC READS AND RUNS SOURCE. The component uses `inject()` and `templateUrl` and cannot
 * be instantiated in this suite's node environment, so the checked-in template is what there is to
 * check — the approach `reorder-affordance.wiring.spec.ts` takes for a binding. A string match
 * would assert a spelling; the acceptance criterion is a behaviour ("the section the author
 * selected is the one that says where the question is going"), so the real expression is lifted
 * out of the real template and RUN against a real two-section form. Any correct condition passes
 * and any incorrect one fails, which is the property a guard about an affordance needs.
 *
 * The files are this repo's own checked-in sources, read off disk in a test process; nothing here
 * comes from a request, and the lifted expression runs nowhere but here. Comments are stripped
 * first: both files explain this decision in prose beside the code, and a guard that matches its
 * own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
} from '@mj-biz-apps/forms-entities';
import { NOTHING_SELECTED, selectPage, selectQuestion, selectScreen } from './builder-selection';
import type { PageNode } from './builder-models';
import { ADDING_HERE, ADDING_TO_LAST, type NewQuestionTarget, targetPageFor } from './new-question-target';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const component = (): string => stripped('form-builder.component.ts');
const template = (): string => stripped('form-builder.component.html');

const page = (id: string, questionIds: readonly string[]): PageNode => ({
  entity: { ID: id } as mjBizAppsFormsFormPageEntity,
  questions: questionIds.map((qid) => ({
    entity: { ID: qid } as mjBizAppsFormsFormQuestionEntity,
    options: [],
  })),
});

const pages: readonly PageNode[] = [page('page-1', ['q-1']), page('page-2', ['q-2'])];

/**
 * The `@if` condition guarding the announcement, lifted out of the template and compiled.
 *
 * The span is the only place `fb-page-target` is spelled, and the `@if` nearest above it is the
 * one that decides whether the author is told anything — so the two anchors bound the expression
 * without the spec having to know how it is written.
 */
function announcementCondition(): (target: NewQuestionTarget | null, forPage: PageNode) => boolean {
  const html = template();
  const span = html.indexOf('fb-page-target');
  expect(span, 'the section header no longer renders an .fb-page-target announcement').toBeGreaterThan(0);
  const before = html.slice(0, span);
  const opened = before.lastIndexOf('@if (');
  expect(opened, 'the announcement is not guarded by an @if').toBeGreaterThan(0);
  const condition = before.slice(opened + '@if ('.length, before.lastIndexOf(')'));
  return new Function('addTarget', 'page', `return !!(${condition});`) as (
    target: NewQuestionTarget | null,
    forPage: PageNode,
  ) => boolean;
}

describe('the builder writes where it says it writes', () => {
  // The next two read source text, so they assert PRESENCE and not behaviour — a call site can be
  // spelled correctly and still be wrong. They are the cheap guard against the private rule coming
  // back; the announcement tests below are the ones that run the real expression.
  it('names the shared rule in the component, and no longer defines a private one (source text)', () => {
    const src = component();
    expect(src).toContain('targetPageFor(');
    expect(
      src,
      'the private rule is back — two answers to one question is exactly the defect',
    ).not.toContain('private targetPageForNewQuestion');
  });

  it('passes the rule’s own page to the create call (source text)', () => {
    // `addQuestion` has to push into the SAME page it created the question against, or the canvas
    // and the database disagree about which section holds it.
    const src = component();
    const body = src.slice(src.indexOf('protected async addQuestion('));
    const untilNextMember = body.slice(0, body.indexOf('\n  protected '));
    expect(untilNextMember).toContain('targetPageFor(this.selection, this.pages)');
    expect(untilNextMember).toContain('target.page');
    expect(untilNextMember).not.toContain('targetPageForNewQuestion()');
  });

  it('announces on the section the rule picked, and nowhere else', () => {
    const announces = announcementCondition();
    const target = targetPageFor(selectPage('page-1'), pages);
    expect(target?.notice).toBe(ADDING_HERE);
    expect(announces(target, pages[0])).toBe(true);
    expect(announces(target, pages[1])).toBe(false);
  });

  it('announces on the section holding the selected question', () => {
    const announces = announcementCondition();
    const target = targetPageFor(selectQuestion('q-1'), pages);
    expect(announces(target, pages[0])).toBe(true);
    expect(announces(target, pages[1])).toBe(false);
  });

  it('announces nothing when nothing is selected', () => {
    // The affordance is absent when the author has selected nothing at all, even though the rule
    // still resolves a section for the click to land in.
    const announces = announcementCondition();
    const target = targetPageFor(NOTHING_SELECTED, pages);
    expect(target?.page.entity.ID).toBe('page-2');
    expect(announces(target, pages[0])).toBe(false);
    expect(announces(target, pages[1])).toBe(false);
  });

  it('announces the fallback when a screen is selected, rather than taking it silently', () => {
    const announces = announcementCondition();
    const target = targetPageFor(selectScreen('s-1'), pages);
    expect(target?.notice).toBe(ADDING_TO_LAST);
    expect(announces(target, pages[1])).toBe(true);
    expect(announces(target, pages[0])).toBe(false);
  });

  it('keeps the announcement inside the multi-section header, so one-section forms gain nothing', () => {
    const html = template();
    const guard = html.indexOf('@if (pages.length > 1)');
    const head = html.indexOf('fb-page-head');
    const announcement = html.indexOf('fb-page-target');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(head);
    expect(head).toBeLessThan(announcement);
  });

  it('styles the announcement with design tokens only', () => {
    const css = stripped('form-builder.styles.ts');
    const rule = css.slice(css.indexOf('.fb-page-target'));
    const block = rule.slice(0, rule.indexOf('}') + 1);
    expect(block).toContain('var(--mj');
    expect(block, 'a hardcoded colour breaks dark mode').not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  it('renders the rule’s own copy rather than retyping it', () => {
    expect(ADDING_HERE).toBe('Adding here');
    expect(
      template(),
      'the copy belongs beside the rule that decides when it applies',
    ).not.toContain(ADDING_HERE);
  });
});
