/**
 * SOURCE-TEXT CHECK of the Forms home template — it asserts that bindings are present, not how they
 * behave. The component spec instantiates the class without rendering the template, so nothing else
 * in the suite can see a template binding go missing.
 *
 * The row is an `<article role="button">` whose `(keydown.enter)` / `(keydown.space)` open the form.
 * A button nested in it must stop those keys itself, or a keyboard user who presses Enter or Space on
 * it opens the form instead (review of PR #348: Enter on the Archive icon opened the builder and the
 * archive confirm was unreachable by keyboard; on the base it also archived the form silently).
 * Same pattern as the template gallery's delete button.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const template = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'forms-home-dashboard.component.html'), 'utf8');

/** The opening tag of the first element carrying `marker`, attributes included. */
function openingTagWith(marker: string): string {
  const at = template.indexOf(marker);
  expect(at, `no ${marker} in the template`).toBeGreaterThan(-1);
  const start = template.lastIndexOf('<', at);
  return template.slice(start, template.indexOf('>', at) + 1);
}

describe('Forms home template (source-text check)', () => {
  it('the row opens the form on Enter and Space, which is why nested buttons must stop those keys', () => {
    const row = openingTagWith('class="mjf-row"');
    expect(row).toContain('(keydown.enter)="openForm(row)"');
    expect(row).toContain('(keydown.space)="openForm(row)');
  });

  it('the Archive/Restore icon stops Enter and Space from reaching the row', () => {
    const trigger = openingTagWith('#archiveTrigger');
    expect(trigger).toContain('(keydown.enter)="$event.stopPropagation()"');
    expect(trigger).toContain('(keydown.space)="$event.stopPropagation()"');
  });
});
