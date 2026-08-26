/**
 * Structural guards for the Rules tab (plans/RULES_SIMPLIFICATION_PLAN.md Phase 3).
 *
 * The component uses decorated inputs and cannot be instantiated in this suite's node
 * environment, so what is checkable is the source. Comments are stripped before every assertion:
 * the source explains these decisions in prose, and a guard that matches its own documentation
 * proves nothing.
 *
 * What the sentences SAY, how they group, and which rules count as broken are tested for real in
 * `rules-inventory.spec.ts`. What is left to prove here is the property that keeps the hub from
 * becoming a liability: it is a VIEW. It renders sentences and routes clicks; it never writes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const tab = (): string => stripped('rules-tab.component.ts');
const builder = (): string => stripped('form-builder.component.ts');
const builderHtml = (): string => stripped('form-builder.component.html');

describe('the hub is a view, not a second editor', () => {
  it('never persists anything itself', () => {
    // Two write paths for one thing is how a hub and a panel come to disagree about what a
    // rule says. The authoring surface stays singular; this file has no route into it.
    const source = tab();
    expect(source).not.toMatch(/BuilderStateService|\bsave\(|saveDebounced|\.Save\(/);
    expect(source).not.toMatch(/ruleChange|withVerbGroup|withJumpRule/);
  });

  it('does not import the rule editor or the authoring panel', () => {
    expect(tab()).not.toMatch(/rules-panel\.component|rule-editor-dialog\.component|conditional-rule-editor/);
  });

  it('reports a clicked row upward instead of acting on it', () => {
    expect(tab()).toMatch(/@Output\(\) readonly openRequested = new EventEmitter<RuleEntry>\(\)/);
  });

  it('the builder answers that by selecting the item and going to Build', () => {
    const source = builder();
    expect(source).toMatch(/openRuleEntry\(entry: RuleEntry\)/);
    expect(source).toMatch(/openRuleEntry[\s\S]{0,900}?this\.activeTab = 'build'/);
    expect(builderHtml()).toMatch(/\(openRequested\)="openRuleEntry\(\$event\)"/);
  });
});

describe('a broken rule is visible without opening the tab', () => {
  it('the tab itself carries the count', () => {
    // The failure it names is otherwise invisible: a condition on a deleted question evaluates
    // false, so the item it guards is hidden from every respondent, and the builder looks fine.
    expect(builderHtml()).toMatch(/activeTab === 'rules'[\s\S]{0,600}?brokenRules > 0/);
  });

  it('and the row says what is wrong in words, not just a colour', () => {
    const source = tab();
    expect(source).toMatch(/entry\.broken\.length > 0/);
    expect(source).toMatch(/never matches/);
  });
});

describe('the tab is built for reading', () => {
  it('renders grouped by page rather than one flat list', () => {
    expect(tab()).toMatch(/@for \(group of groups; track group\.pageId\)/);
  });

  it('makes the whole row the click target, at tap height', () => {
    // Fitts: a sentence is what the author is looking at, so the sentence is what they click —
    // not a small pencil at the end of it.
    const source = tab();
    expect(source).toMatch(/\.rt-row \{[\s\S]*?min-height: var\(--mjf-tap\)/);
    expect(source).toMatch(/<button[\s\S]{0,200}?class="rt-row"/);
  });

  it('teaches in the empty state instead of reporting a count of zero', () => {
    const source = tab();
    expect(source).toMatch(/entries\.length === 0/);
    expect(source).toMatch(/mjf-empty-title/);
  });

  it('uses design tokens for every colour, like every other surface here', () => {
    // A hardcoded colour here would break dark mode on the one screen an author reads longest.
    expect(tab()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/);
  });
});

describe('what the builder offers a rule to read', () => {
  it('builds every source list through one helper, so the same questions are excluded everywhere', () => {
    // There were six places assembling a source list — a page's show gate, its jump, a
    // question's show gate, its jump, an ending's, and the Rules tab's — each mapping the tree
    // itself. Six copies of "which questions can a rule read" is six places for the answer to
    // drift, and the first thing that had to be excluded (a Statement, which collects no
    // answer) would have needed adding to all six.
    const source = builder();
    expect(source).toMatch(/private sourcesOf\(/);
    expect(source.match(/toConditionalSource\(/g) ?? []).toHaveLength(1);
  });

  it('drops a question that cannot be a source rather than rendering a ghost', () => {
    // `toConditionalSource` returns undefined for a question that collects no answer. Mapping
    // it straight into the array would put `undefined` in a list every consumer then indexes.
    expect(builder()).toMatch(/sourcesOf\([\s\S]{0,220}?toConditionalSource\([\s\S]{0,80}?\?\?\s*\[\]/);
  });
});
