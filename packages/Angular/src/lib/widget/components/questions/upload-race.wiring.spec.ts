/**
 * Structural guards for the file/signature upload race.
 *
 * These classes use `inject()` and cannot be instantiated in this suite's node environment, so
 * what is checkable is the source. The decisions below are invisible to a unit test of the pure
 * helpers and produce silently wrong DATA when they regress, on the one answer type where the
 * artifact's exact content is the entire point.
 *
 * THE RACE. `onPointerUp` exports the pad whenever there is ink on it, and `hasInk` stays true
 * after the first stroke — so a two-word signature fires an upload per stroke. `uploadFile` had
 * no sequencing, so those uploads ran concurrently and the last `valueChange.emit` to arrive won,
 * not the last one started. On a lossy mobile link that is routinely the FIRST stroke: the stored
 * answer becomes a partial signature the respondent never agreed to. The same gap let a cleared
 * signature come back — `clear()` emits null, then a still-running upload resolves and emits its
 * fileId over the top, leaving a stored signature beside an empty pad reading "Draw your
 * signature above."
 *
 * Comments are stripped before every assertion — the source explains these same decisions, and a
 * guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const question = (): string => stripped('form-question.component.ts');
const pad = (): string => stripped('signature-pad.component.ts');

describe('only the newest upload may write the answer', () => {
  it('stamps each upload with a generation', () => {
    expect(question()).toMatch(/uploadGeneration/);
    expect(question()).toMatch(/const generation = \+\+this\.uploadGeneration;/);
  });

  it('drops a result that a newer upload has superseded', () => {
    // Both paths matter: a stale SUCCESS overwrites the good answer, and a stale FAILURE clears
    // an answer the newer upload just stored correctly.
    const matches = question().match(/generation !== this\.uploadGeneration/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('drops a stale progress tick too, so the bar cannot run backwards', () => {
    expect(question()).toMatch(
      /\(fraction\) => \{[\s\S]{0,200}generation !== this\.uploadGeneration[\s\S]{0,120}uploadProgress\.set\(fraction\)/,
    );
  });
});

describe('clearing a signature cannot be undone by an upload already in flight', () => {
  it('invalidates the running upload when the answer is cleared', () => {
    expect(question()).toMatch(/onSignatureCleared\(\)[\s\S]{0,300}this\.uploadGeneration \+= 1;/);
  });
});

describe('a multi-stroke signature stays correct without deferring the export', () => {
  it('exports on pointer-up rather than on a timer', () => {
    // A settle timer was tried and removed. It opens a window of real time in which the pad reads
    // "Signed." and the respondent can tap Next or Submit — destroying the component with the
    // export pending — and it CANNOT be flushed on destroy, because `output()` registers its own
    // destroy hook in a field initializer that runs before any constructor hook, so `emit()` by
    // then only warns and returns. A null answer under a pad claiming "Signed." is worse than the
    // duplicate uploads the timer saved.
    expect(pad()).not.toMatch(/setTimeout\(/);
    expect(pad()).not.toMatch(/SIGNATURE_SETTLE_MS/);
    expect(pad()).toMatch(/onPointerUp\([\s\S]{0,1400}void this\.emitPng\(\);/);
  });

  it('relies on the generation stamp, not on ordering, for which image wins', () => {
    // This is what makes exporting per stroke safe: the last upload STARTED wins regardless of
    // which arrives first, and that is the most complete drawing.
    expect(question()).toMatch(/const generation = \+\+this\.uploadGeneration;/);
  });
});
