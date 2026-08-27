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
const state = (): string => stripped('builder-state.service.ts');
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

describe('moving the default is ordered, not debounced', () => {
  it('the old default is cleared before the new one is set', () => {
    // A filtered unique index permits one default per form. Setting the new one first leaves the
    // form momentarily holding two, and the database refuses the write.
    const body = methodBody(state(), 'public async setDefaultEnding');
    expect(body.indexOf('changes.clear')).toBeLessThan(body.indexOf('changes.set'));
  });

  it('every write is awaited, so the order actually holds at runtime', () => {
    const body = methodBody(state(), 'public async setDefaultEnding');
    expect(body).toMatch(/await this\.saveChecked\(screen, 'clear default ending'\)/);
    expect(body).not.toMatch(/saveDebounced/);
  });
});

describe('a new ending fills a vacancy, rather than counting endings', () => {
  it('addScreen asks whether the form HAS a default, not whether it has any endings', () => {
    // "no ending exists yet" is not the same question. A form whose only ending is screened out
    // has an ending and no default, so the next ending an author adds was left un-flagged and
    // the form kept no catch-all at all — invisible before this invariant existed, and a broken
    // promise now that the label says every form has exactly one.
    const body = methodBody(state(), 'public async addScreen');
    expect(body).toMatch(/defaultEndingId\(/);
    expect(body).not.toMatch(/!tree\.screens\.some\(\(s\) => s\.ScreenType === 'Ending'\)/);
  });
});

describe('deleting the default leaves a default behind', () => {
  it('the delete path promotes a survivor rather than returning a bare boolean', () => {
    // The reported defect: deleting the default ending left the form with none, and the one
    // remaining ending rendered "Never shown — add a condition" while being the only screen a
    // respondent could reach.
    const body = methodBody(state(), 'public async deleteScreen');
    expect(body).toMatch(/vacantDefaultEnding\(tree\.screens\)/);
    expect(body).toMatch(/promote\.IsDefault = true/);
  });

  it('the tree splice moved in with it, so no caller can delete without repairing', () => {
    expect(methodBody(state(), 'public async deleteScreen')).toMatch(/tree\.screens = tree\.screens\.filter/);
    expect(stripped('form-builder.component.ts')).not.toMatch(
      /this\.tree\.screens = this\.tree\.screens\.filter\(\(s\) => s\.ID !== screen\.ID\)/,
    );
  });
});


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
