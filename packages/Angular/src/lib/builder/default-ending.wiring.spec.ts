/**
 * Structural guards for the one write in the builder that touches TWO records.
 *
 * The pure decisions live in `default-ending.ts` and are tested directly. What cannot be tested
 * directly is the wiring: these are decorated Angular classes that this suite's node environment
 * cannot instantiate, so what is checkable is the source — the same constraint, and the same
 * approach, as `rules-panel.dialog.wiring.spec.ts`.
 *
 * Comments are stripped before every assertion. The source explains these decisions in prose, and
 * a guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const screenEditor = (): string => stripped('screen-editor.component.ts');
const builderHtml = (): string => stripped('form-builder.component.html');

/** One method's source, from its signature to whatever member follows it. */
const methodBody = (source: string, signature: string): string => {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start + signature.length);
  const end = rest.search(/\n  (?:public|private|protected) /);
  return rest.slice(0, end === -1 ? undefined : end);
};

describe('the default ending is chosen, not toggled', () => {
  it('the screen editor no longer flips the flag itself', () => {
    // It used to, and that is the whole defect: one screen's switch could not clear whichever
    // OTHER screen held the default, so a form ended up with two or none.
    expect(screenEditor()).not.toMatch(/IsDefault\s*=\s*!/);
  });

  it('it reports the intent to the host, which is the party holding every screen', () => {
    expect(screenEditor()).toMatch(/makeDefaultRequested\s*=\s*new EventEmitter/);
    expect(screenEditor()).toMatch(/makeDefaultRequested\.emit\(/);
  });

  it('the switch cannot be turned OFF — a form with no catch-all is not a state to offer', () => {
    expect(screenEditor()).toMatch(/\[disabled\]="s\.IsDefault"/);
  });

  it('a screened-out ending is not offered the default at all', () => {
    // `resolveEndingScreen` excludes screened-out endings from resolution, so making one the
    // default would be a control that does nothing — and `defaultEndingChanges` throws on it.
    expect(screenEditor()).toMatch(/@if \(!s\.IsDisqualification\) \{/);
  });

  it('and the default ending cannot be screened out from the other direction', () => {
    const source = screenEditor();
    const dqBlock = source.slice(source.indexOf('Screened out'));
    expect(dqBlock).toMatch(/\[disabled\]="s\.IsDefault"/);
  });

  it('the host routes the request to the service that owns the pair of writes', () => {
    expect(builderHtml()).toMatch(/\(makeDefaultRequested\)="onMakeDefaultEnding\(\$event\)"/);
  });
});

// Ordering and the no-debounce rule used to be asserted here, by matching the literal call text
// inside `setDefaultEnding`. Both live in `builder-state.default-ending.spec.ts`, which models the
// unique index and observes the outcome instead.

// The two `builder-state.service.ts` decisions that used to be read out of method bodies here — a
// new ending fills a VACANCY rather than counting endings, and deleting the default promotes a
// survivor and takes the screen out of the tree — are executed in `builder-state.default-ending.spec.ts`
// now (#303): the promotion became part of the same graph save as the delete, which a regex over
// the method text could neither see nor survive.

describe('a refused move releases the builder instead of freezing it', () => {
  const builder = (): string => stripped('form-builder.component.ts');

  it('the busy flag is cleared in a finally, not on the happy path', () => {
    // `setDefaultEnding` THROWS on an id naming no eligible ending, rather than returning false
    // like every other write here. Without try/finally the flag stays true forever and every
    // guarded handler in the builder goes inert — a dead builder, reported as "it just stopped
    // responding", with nothing on screen to connect it to this line.
    const body = methodBody(builder(), 'protected async onMakeDefaultEnding');
    expect(body).toMatch(/try \{/);
    expect(body).toMatch(/\} finally \{[\s\S]{0,120}this\.busy = false/);
  });
});
