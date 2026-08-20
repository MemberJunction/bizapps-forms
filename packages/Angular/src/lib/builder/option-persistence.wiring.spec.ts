/**
 * Structural guards for persisting an OPTION edit.
 *
 * These components use `inject()` and cannot be instantiated in this suite's node environment,
 * so what is checkable is the source. The decision below is invisible to a unit test of the pure
 * helpers, and it loses authored work silently.
 *
 * THE DEFECT. `setOptionImage` and `setOptionLabel` mutate a `FormQuestionOption` entity and then
 * emit `questionChanged`, whose handler saves `node.entity` — the QUESTION. An option is a
 * separate record, and nothing ever called `Save()` on it. The only path that incidentally saved
 * one was `persistOptionOrder`, which runs on removal and only for options whose `DisplayOrder`
 * actually changed.
 *
 * It is invisible while you work, which is what makes it expensive: `buildPublishedDefinition`
 * reads `ImageURL` and `Label` off the IN-MEMORY entity, so the canvas looks right and even a
 * publish right now carries the change. Reload the builder and it is gone, and the next publish
 * silently drops it from the live form — with no error anywhere, because no save was ever
 * attempted and `lastFailure` therefore never set.
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

const editor = (): string => stripped('question-editor.component.ts');
const editorHtml = (): string => stripped('question-editor.component.html');
const builder = (): string => stripped('form-builder.component.ts');
const builderHtml = (): string => stripped('form-builder.component.html');

describe('an option edit reaches the database', () => {
  it('the editor has an output for a changed option', () => {
    expect(editor()).toMatch(/@Output\(\)\s+optionChanged\s*=\s*new EventEmitter</);
  });

  it('setting an option image emits it', () => {
    expect(editor()).toMatch(/setOptionImage\([\s\S]{0,400}this\.optionChanged\.emit\(/);
  });

  it('setting an option label emits it', () => {
    // Same bug, older code: labels were never persisted either, by exactly this route.
    expect(editor()).toMatch(/setOptionLabel\([\s\S]{0,400}this\.optionChanged\.emit\(/);
  });

  it('the builder binds that output', () => {
    expect(builderHtml()).toMatch(/\(optionChanged\)="onOptionChanged\(\$event\)"/);
  });

  it('the builder saves the OPTION, not the question that owns it', () => {
    expect(builder()).toMatch(
      /onOptionChanged\(option:[\s\S]{0,300}this\.state\.saveDebounced\(option\)/,
    );
  });
});

describe('the picture-choice image control is wired to that path', () => {
  it('still calls setOptionImage', () => {
    expect(editorHtml()).toMatch(/\(valueChange\)="setOptionImage\(/);
  });
});
