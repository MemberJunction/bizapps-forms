/**
 * Source-text checks that the builder template wires the tab strip to `builder-tabs.ts` (UI audit
 * F12). The key logic itself is behaviour-tested in `builder-tabs.spec.ts`; the builder component
 * cannot be compiled in this suite, so what is checkable here is that the template binds it.
 * Comments are stripped first, so a guard cannot pass against the prose that describes it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const strip = (s: string): string =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const html = strip(readFileSync(join(__dirname, 'form-builder.component.html'), 'utf8'));
const ts = strip(readFileSync(join(__dirname, 'form-builder.component.ts'), 'utf8'));
const strip_ = /<nav class="fb-tabs"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';

describe('the tab strip is one Tab stop that the arrow keys move along', () => {
  it('renders the tabs from BUILDER_TAB_ITEMS rather than five copies', () => {
    expect(strip_).toMatch(/@for \(item of tabItems; track item\.tab\)/);
    expect(strip_.match(/role="tab"/g)).toHaveLength(1);
  });

  it('only the selected tab is in the Tab order', () => {
    expect(strip_).toMatch(/\[attr\.tabindex\]="activeTab === item\.tab \? 0 : -1"/);
  });

  it('each tab names the panel it controls', () => {
    expect(strip_).toMatch(/\[id\]="tabId\(item\.tab\)"/);
    expect(strip_).toMatch(/\[attr\.aria-controls\]="panelId\(item\.tab\)"/);
  });

  it('the strip handles its keys', () => {
    expect(strip_).toMatch(/\(keydown\)="onTabKey\(\$event\)"/);
    expect(ts).toMatch(/onTabKey\(event: KeyboardEvent\): void \{[\s\S]{0,300}tabAfterKey\(this\.activeTab, event\.key\)/);
    expect(ts).toMatch(/onTabKey[\s\S]{0,500}event\.preventDefault\(\)/);
  });
});

describe('every pane is a tabpanel labelled by its tab', () => {
  for (const tab of ['build', 'design', 'distribute', 'automate', 'responses']) {
    it(tab, () => {
      const re = new RegExp(`role="tabpanel"[^>]*\\[id\\]="panelId\\('${tab}'\\)"[^>]*\\[attr\\.aria-labelledby\\]="tabId\\('${tab}'\\)"`);
      expect(html).toMatch(re);
    });
  }
});
