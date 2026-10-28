/**
 * SOURCE-TEXT CHECK of the Forms home template — it asserts that bindings are present, not how they
 * behave. The component spec instantiates the class without rendering the template, so nothing else
 * in the suite can see a template binding go missing.
 *
 * History: the row used to be an `<article role="button">` whose `(keydown.enter)` / `(keydown.space)`
 * opened the form, so every button nested in it had to stop those keys (review of PR #348: Enter on
 * the Archive icon opened the builder and the archive confirm was unreachable by keyboard). The UI
 * audit (F05) removed the cause: the row is no longer a button, so a key pressed on the Archive icon
 * or in the confirm can only reach that control. These checks pin that the cause stays removed.
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
  it('the row listens to no keys, so a key on a control inside it cannot open the form', () => {
    const row = openingTagWith('class="mjf-row"');
    expect(row).not.toContain('(keydown');
    expect(row).toContain('(mjfRowActivate)="openForm(row)"');
  });

  it('the Archive/Restore icon is a plain button again: no stops needed', () => {
    const trigger = openingTagWith('#archiveTrigger');
    expect(trigger).toContain('(click)="requestArchive(row)"');
    expect(trigger).not.toContain('stopPropagation');
  });

  it('Escape still cancels the inline archive confirm', () => {
    expect(openingTagWith('class="home-confirm"')).toContain('(keydown.escape)="cancelArchive($event)"');
  });
});
