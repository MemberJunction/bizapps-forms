/**
 * Structural guards for how a failed FileUpload or Doodle upload is shown (#248).
 *
 * The store now retries a bad moment by itself, so by the time a failure reaches the screen it is
 * one of two things a respondent must act on: the server refused the file (`refused` — pick a
 * different one) or the retries are spent (`unsaved` — try again). The old red error with a
 * warning icon and a "Retry upload" button announced every flicker of the connection as an alarm,
 * and the button retried a refused file into the same refusal. What replaces it is one quiet
 * line, in the page's normal ink, with a text link whose action matches the kind of failure.
 *
 * `FormQuestionComponent` cannot be rendered in this suite's node environment (signal inputs need
 * Angular's compile-time transform), so the template, component and stylesheet text are what is
 * checkable. Comments are stripped before every assertion — the sources explain these same
 * decisions, and a guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { UPLOAD_UNSAVED_MESSAGE } from '../../core/upload-store';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const template = (): string => stripped('form-question.component.html');
const component = (): string => stripped('form-question.component.ts');
const css = (): string => stripped('form-question.component.css');

/** The text of one `@case` branch, up to the marker that opens the next one. */
function branch(open: string, next: string): string {
  const html = template();
  const start = html.indexOf(open);
  const end = html.indexOf(next, start + open.length);
  if (start < 0 || end < 0) {
    throw new Error(`branch ${open} not found in the question template`);
  }
  return html.slice(start, end);
}

const fileUpload = (): string => branch("@case ('FileUpload')", "@case ('PictureChoice')");
const doodle = (): string => branch("@case ('Doodle')", '@default {');

describe.each([
  ['FileUpload', fileUpload],
  ['Doodle', doodle],
])('a failed %s upload is one quiet line, not an alarm', (_type, body) => {
  it('drops the red error, its warning icon and the retry button', () => {
    expect(body()).not.toMatch(/mjf-file__error/);
    expect(body()).not.toMatch(/triangle-exclamation/);
    expect(body()).not.toMatch(/mjf-file__retry/);
  });

  it('announces the line politely rather than as an alert', () => {
    // An alert interrupts whatever the screen reader is saying; a failure the respondent can fix
    // at their own pace is not worth that.
    expect(body()).toMatch(/<p class="mjf-file__failed" aria-live="polite">/);
    expect(body()).not.toMatch(/role="alert"/);
  });

  it('says what the store says, and nothing of its own', () => {
    expect(body()).toMatch(/@if \(uploadFailure\(\); as failure\)[\s\S]{0,120}\{\{ failure\.message \}\}/);
  });

  it('offers "Choose again" for a refused file and "Try again" for an unsaved one', () => {
    // Retrying a refused file sends the same bytes into the same verdict, so the link changes
    // with the kind of failure.
    expect(body()).toMatch(
      /@if \(failure\.kind === 'refused'\) \{\s*<button type="button" class="mjf-file__failed-link"[^>]*>\s*Choose again\s*<\/button>\s*\} @else \{\s*<button type="button" class="mjf-file__failed-link" \(click\)="retryUpload\(\)">\s*Try again\s*<\/button>/,
    );
  });
});

describe('"Choose again" starts the respondent over on the right control', () => {
  it('on a file question, clears the upload and resets the picker it came from', () => {
    expect(fileUpload()).toMatch(/class="mjf-file__failed-link" \(click\)="chooseAgain\(fileInput\)"/);
    expect(component()).toMatch(
      /protected chooseAgain\(input: HTMLInputElement\): void \{\s*this\.uploads\.clear\(this\.question\(\)\.id\);\s*input\.value = '';\s*input\.focus\(\);\s*\}/,
    );
  });

  it('on a doodle question, clears the pad itself, which clears the upload through `cleared`', () => {
    expect(doodle()).toMatch(/<mjf-doodle-pad\s+#pad/);
    expect(doodle()).toMatch(/class="mjf-file__failed-link" \(click\)="pad\.clear\(\)"/);
  });
});

describe('the component hands the upload to the store and keeps no failure wording', () => {
  it('reads the failure, kind and all, from the store', () => {
    expect(component()).toMatch(/uploadFailure = computed\(\(\) => this\.upload\(\)\.failure\)/);
    expect(component()).not.toMatch(/uploadError/);
  });

  it('restarts through the store, which kept the file and the transport call', () => {
    expect(component()).toMatch(/retryUpload\(\): Promise<void> \{\s*return this\.uploads\.restart\(this\.question\(\)\.id\);/);
  });

  it('holds neither sentence, nor a fallback of its own', () => {
    for (const source of [component(), template()]) {
      expect(source).not.toContain(UPLOAD_UNSAVED_MESSAGE);
      expect(source).not.toContain('That file was not accepted');
      expect(source).not.toContain('Retry upload');
      expect(source).not.toContain('Upload failed. Please try again.');
    }
  });
});

describe('the quiet line is styled as text', () => {
  it('drops the alarm styles', () => {
    expect(css()).not.toMatch(/\.mjf-file__error/);
    expect(css()).not.toMatch(/\.mjf-file__retry/);
  });

  it('uses the page ink, not the error colour', () => {
    expect(css()).toMatch(/\.mjf-file__failed \{[^}]*color: var\(--mjf-page-ink\);/);
    expect(css()).not.toMatch(/\.mjf-file__failed[^{]*\{[^}]*--mjf-status-error/);
  });

  it('draws the link as a link, with the shared focus ring', () => {
    expect(css()).toMatch(/\.mjf-file__failed-link \{[^}]*background: none;[^}]*border: 0;/);
    expect(css()).toMatch(/\.mjf-file__failed-link \{[^}]*color: var\(--mjf-accent\);/);
    expect(css()).toMatch(/\.mjf-file__failed-link \{[^}]*text-decoration: underline;/);
    expect(css()).toMatch(/\.mjf-file__failed-link:focus-visible \{[^}]*box-shadow: var\(--mjf-focus-ring\);/);
  });
});
