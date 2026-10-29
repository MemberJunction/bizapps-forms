/**
 * SOURCE-TEXT CHECK that both dashboards render their failed states with a way out. It asserts the
 * branches are present, not how they behave; the component specs hold the behaviour
 * (`reportState`, `listState`, no host Error). Without these branches a failure that no longer
 * reaches MJ's host (UI audit F01) would show nothing at all.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

/** The text of the `@if`/`@else if` block whose condition is `condition`. */
function branch(html: string, condition: string): string {
  const at = html.indexOf(condition);
  expect(at, `no branch on ${condition}`).toBeGreaterThan(-1);
  const end = html.indexOf('} @else', at);
  return html.slice(at, end === -1 ? undefined : end);
}

describe('dashboard failed states (source-text check)', () => {
  it('the report pane has a failed state whose Retry re-reads the report', () => {
    const failed = branch(read('forms-reporting-dashboard.component.html'), "reportState === 'failed'");
    expect(failed).toContain('Couldn’t load this form’s responses.');
    expect(failed).toContain('(click)="refresh()"');
    expect(failed).toContain('Retry');
  });

  it('the Forms home has a failed state whose Retry re-reads the list, ahead of first run', () => {
    const html = read('../home/forms-home-dashboard.component.html');
    const failed = branch(html, "listState === 'failed'");
    expect(failed).toContain('Couldn’t load your forms.');
    expect(failed).toContain('(click)="loadForms()"');
    expect(html.indexOf("listState === 'failed'")).toBeLessThan(html.indexOf("listState === 'first-run'"));
  });

  it('the Forms home says when every form is archived', () => {
    const archived = branch(read('../home/forms-home-dashboard.component.html'), "listState === 'all-archived'");
    expect(archived).toContain('forms are archived.');
    expect(archived).toContain('(click)="toggleArchived()"');
  });
});
