/**
 * Structural guards for how a form's logic is made visible on the canvas.
 *
 * There was a Rules tab: a hub listing every rule on the form in reading order, with the broken
 * ones badged. It read well and it was in the wrong place — it said things about a question that
 * belonged BESIDE that question, and an author had to know the tab existed to find out a question
 * was conditional at all. The sentences it composed are still composed (`rules-inventory.ts`);
 * what changed is where they are shown.
 *
 * The one thing that MUST survive the tab is its warning. A condition naming a question that was
 * since deleted evaluates false, so the item it guards is hidden from every respondent —
 * permanently, silently, with the form still looking correct in the builder. Nothing else in the
 * builder says so, which is why the tab was worth opening and why the badge is worth rendering.
 *
 * The component uses decorated inputs and cannot be instantiated in this suite's node
 * environment, so what is checkable is the source. Comments are stripped before every assertion:
 * the source explains these decisions in prose, and a guard that matches its own documentation
 * proves nothing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const builder = (): string => stripped('form-builder.component.ts');
const builderHtml = (): string => stripped('form-builder.component.html');

describe('the Rules tab is gone, not hidden', () => {
  it('leaves no tab to open', () => {
    // A tab left in the union but unreachable in the template is a state the component can still
    // be put into — by a restored preference, by a deep link, by the next person reading the
    // union and wiring a button to it.
    expect(builder()).not.toMatch(/'rules'/);
    expect(builderHtml()).not.toMatch(/mjf-rules-tab|activeTab === 'rules'/);
  });

  it('takes its component with it rather than orphaning the file', () => {
    expect(existsSync(join(__dirname, 'rules-tab.component.ts'))).toBe(false);
    expect(builder()).not.toMatch(/RulesTabComponent/);
  });
});

describe('a rule is visible on the item it is about', () => {
  it('badges the question and the page, which are the two the canvas draws', () => {
    // An ending already says "Conditional ending" in words of its own; a page said nothing at
    // all, and a page rule hides every question on it.
    const html = builderHtml();
    expect(html).toMatch(/badges\.get\(node\.entity\.ID\)/);
    expect(html).toMatch(/badges\.get\(page\.entity\.ID\)/);
  });

  it('reads the whole form once per render, not once per question', () => {
    // `ruleBadges` walks every rule on the form. Called from inside the question loop it would
    // do that once per question, on exactly the forms long enough for it to hurt.
    const html = builderHtml();
    expect(html).toMatch(/@let badges = ruleBadges;/);
    expect(html).not.toMatch(/@for \(badge of ruleBadges/);
  });

  it('says what is wrong in words, never in colour alone', () => {
    // The warning token turns a badge amber. Amber is not a message, and it is not one at all to
    // a colourblind author or a screen reader.
    const html = builderHtml();
    expect(html).toMatch(/\[class\.mjf-badge--warning\]="badge\.broken"/);
    expect(html).toMatch(/\[title\]="badge\.detail"/);
    expect(html).toMatch(/\{\{ badge\.label \}\}/);
  });

  it('is a label, not a second way to write a rule', () => {
    // Two write paths for one thing is how a summary and a panel come to disagree about what a
    // rule says. The badge has no click handler; selecting the row opens the panel that owns it.
    const html = builderHtml();
    const badgeSpans = html.match(/<span[^>]*fb-rule-badge[\s\S]{0,200}?>/g) ?? [];
    expect(badgeSpans.length).toBeGreaterThan(0);
    for (const span of badgeSpans) {
      expect(span).not.toMatch(/\(click\)/);
    }
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
