/**
 * Source-text smoke: the builder keeps its tab and its Responses view in the URL (UI audit F09).
 *
 * What a URL means and when it may be read or written is specced in builder-url-sync.spec.ts and
 * shared/view-urls.spec.ts; the Responses tab's side (InitialState, StateChange, ApplyState) in
 * responses-tab.component.spec.ts. The builder component cannot be compiled in this node suite, so
 * this checks only that it is wired to them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ts = readFileSync(join(__dirname, 'form-builder.component.ts'), 'utf8');
const html = readFileSync(join(__dirname, 'form-builder.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

describe('the builder in the URL (source-text smoke)', () => {
  it('opens on the view the URL names once the tree is loaded, and follows back / forward', () => {
    expect(ts).toMatch(/new BuilderUrlSync\(this\.record\.ID,/);
    expect(ts).toMatch(/this\.urlSync\.Read\(\)/);
    expect(ts).toMatch(/this\.urlSync\.Watch\(/);
  });

  it('writes the tab the author switches to', () => {
    expect(ts).toMatch(/protected setTab\(tab: BuilderTab\): void \{[\s\S]*?this\.writeUrl\(\);/);
  });

  it('hands the Responses tab its starting state and hears what it shows', () => {
    expect(html).toMatch(/<mjf-responses-tab[^>]*\[InitialState\]="responsesState"/);
    expect(html).toMatch(/<mjf-responses-tab[^>]*\(StateChange\)="onResponsesState\(\$event\)"/);
  });

  it('stops listening to the URL when the builder goes away', () => {
    expect(ts).toMatch(/ngOnDestroy\(\): void \{[\s\S]*?this\.urlSync\?\.Stop\(\)/);
  });
});
