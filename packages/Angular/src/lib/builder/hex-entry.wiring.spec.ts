/**
 * Structural guards for the hex field's two paths.
 *
 * The decisions themselves are pure and tested directly in `color-model.spec.ts`. What cannot be
 * tested directly is which function each path calls — and that is the entire defect in #154, where
 * the keystroke handler called the commit-time one. `ColorPickerComponent` injects `ElementRef`, so
 * this suite's node environment cannot instantiate it; the source is what is checkable, the same
 * constraint and the same approach as `default-ending.wiring.spec.ts`.
 *
 * Comments are stripped before every assertion, so a guard cannot pass by matching prose.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const picker = (): string =>
  readFileSync(join(__dirname, 'color-picker.component.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

/** One method's source, from its signature to whatever member follows it. */
const methodBody = (source: string, signature: string): string => {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start + signature.length);
  const end = rest.search(/\n  (?:public|private|protected) /);
  return rest.slice(0, end === -1 ? undefined : end);
};

describe('the hex field sanitises while typing and expands only on commit', () => {
  it('the keystroke handler never calls the expanding function', () => {
    // The defect exactly: onHexInput called normalizeHexInput, so '#1a2' was rewritten to
    // '#11aa22' and emitted, and the three keystrokes still to come were dropped by the cap.
    const body = methodBody(picker(), 'protected onHexInput(event: Event): void {');
    expect(body).toMatch(/sanitizeHexInput\(/);
    expect(body).not.toMatch(/normalizeHexInput\(/);
  });

  it('the keystroke handler corrects the box itself when it drops a character', () => {
    // Setting a signal to the value it already holds re-renders nothing, so a rejected character
    // would sit in the box looking accepted. The element is the only thing that can fix that.
    const body = methodBody(picker(), 'protected onHexInput(event: Event): void {');
    expect(body).toMatch(/el\.value !== typed/);
    expect(body).toMatch(/el\.value = typed/);
  });

  it('the commit handler expands before it decides to snap back', () => {
    // Order is the guard. Testing isCompleteHex(draft()) first would discard deliberate shorthand
    // as if it were an abandoned partial.
    const body = methodBody(picker(), 'protected commitHexEntry(): void {');
    const expandAt = body.indexOf('normalizeHexInput(');
    const snapAt = body.indexOf('this.draft.set(this.value())');
    expect(expandAt).toBeGreaterThan(-1);
    expect(snapAt).toBeGreaterThan(-1);
    expect(expandAt).toBeLessThan(snapAt);
  });

  it('an abandoned partial still snaps back to the colour that was there', () => {
    expect(methodBody(picker(), 'protected commitHexEntry(): void {'))
      .toMatch(/this\.draft\.set\(this\.value\(\)\)/);
  });

  it('both commit gestures reach the same handler', () => {
    const source = picker();
    expect(source).toMatch(/\(blur\)="commitHexEntry\(\)"/);
    expect(source).toMatch(/\(keydown\.enter\)="commitHexEntry\(\)"/);
    expect(source).not.toMatch(/onHexBlur/);
  });
});
