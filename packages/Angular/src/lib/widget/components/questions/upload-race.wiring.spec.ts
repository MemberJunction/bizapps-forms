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
 * The race rules themselves now live in `core/upload-store.ts` and are unit-tested directly in
 * `upload-store.spec.ts`, which is a stronger check than any regex over this file. What is left
 * for these guards is the WIRING: that this component delegates to the store and honours its
 * refusals, and that it keeps no upload state of its own — the state that used to bleed between
 * questions when Angular reused an instance.
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
  it('takes a token from the store for every upload', () => {
    expect(question()).toMatch(/const token = this\.uploads\.begin\(questionId, file\);/);
  });

  it('emits the answer only when the store accepts the result', () => {
    // Both paths matter: a stale SUCCESS overwrites the good answer, and a stale FAILURE clears
    // an answer the newer upload just stored correctly. The store decides; this honours it.
    expect(question()).toMatch(/if \(this\.uploads\.succeed\(token\)\) \{[\s\S]{0,120}valueChange\.emit\(result\.fileId\)/);
    expect(question()).toMatch(/if \(this\.uploads\.fail\(token, message\)\) \{[\s\S]{0,120}valueChange\.emit\(null\)/);
  });

  it('routes progress through the token too, so the bar cannot run backwards', () => {
    expect(question()).toMatch(/\(fraction\) => this\.uploads\.setProgress\(token, fraction\)/);
  });
});

describe('upload state belongs to a question, not to this component', () => {
  it('keeps no upload state of its own', () => {
    // The defect these replaced: six private fields outlived the question they described, so a
    // recycled instance announced one file question's upload against another's.
    expect(question()).not.toMatch(/private uploadGeneration/);
    expect(question()).not.toMatch(/private lastFile/);
    expect(question()).not.toMatch(/uploadStatus = signal/);
    expect(question()).not.toMatch(/uploadFileName = signal/);
  });

  it('reads what it displays from the store, keyed by the question it is rendering', () => {
    expect(question()).toMatch(/this\.uploads\.viewFor\(this\.question\(\)\.id\)/);
  });

  it('retrieves the retry file by question rather than remembering it', () => {
    expect(question()).toMatch(/this\.uploads\.lastFileFor\(this\.question\(\)\.id\)/);
  });
});

describe('clearing a signature cannot be undone by an upload already in flight', () => {
  it('clears through the store, which retires the running upload', () => {
    expect(question()).toMatch(/onSignatureCleared\(\)[\s\S]{0,300}this\.uploads\.clear\(this\.question\(\)\.id\);/);
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

  it('relies on the store\'s token, not on ordering, for which image wins', () => {
    // This is what makes exporting per stroke safe: the last upload STARTED wins regardless of
    // which arrives first, and that is the most complete drawing.
    expect(question()).toMatch(/const token = this\.uploads\.begin\(questionId, file\);/);
  });
});
