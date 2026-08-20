/**
 * Structural guards for the file-download wiring.
 *
 * The service and the component both use `inject()` and cannot be instantiated in this suite's
 * node environment, so what is checkable is the source. Each assertion below is a decision that
 * is invisible to a unit test of the pure helpers and expensive to get wrong.
 *
 * Comments are stripped before every assertion — the source explains these same decisions, and a
 * guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = join(__dirname);

const stripped = (file: string): string =>
  readFileSync(join(HERE, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const service = (): string => stripped('response-file-download.service.ts');
const component = (): string => stripped('response-detail.component.ts');

describe('the download carries the session', () => {
  it('sends the bearer token, which a plain link could not', () => {
    // An <a href> or window.open cannot set a header, so the browser would arrive
    // unauthenticated and be turned away.
    expect(service()).toMatch(/Authorization: `Bearer \$\{token\}`/);
  });

  it('fetches rather than navigating', () => {
    expect(service()).toMatch(/await fetch\(url, \{ headers: this\.headers\(\)/);
    expect(service()).not.toMatch(/window\.open\(/);
  });
});

describe('the object URL is released, but not too early', () => {
  it('revokes it', () => {
    // Never revoking leaks every file a reviewer opens for the life of the page.
    expect(service()).toMatch(/revokeObjectURL/);
  });

  it('defers the revoke instead of doing it inline', () => {
    // Revoking before the browser starts the save cancels it in Safari.
    expect(service()).toMatch(/setTimeout\(\(\) => URL\.revokeObjectURL/);
  });
});

describe('failures reach the reader', () => {
  it('never throws out of the service', () => {
    // A rejected promise would leave a spinner that stopped for no stated reason.
    expect(service()).toMatch(/catch \(err\)/);
    expect(service()).toMatch(/return \{ ok: false, error:/);
  });

  it('keeps the error against the file it belongs to', () => {
    // A response with a resume and a signature needs to say which one failed.
    expect(component()).toContain('DownloadErrorFileId === f.fileId');
  });
});

describe('the click downloads', () => {
  it('binds the filename button to the download, not to the record', () => {
    expect(component()).toMatch(/class="file"[\s\S]{0,600}\(click\)="DownloadFile\(f\)"/);
  });

  it('still offers the file record, just not as the filename', () => {
    expect(component()).toContain(`(click)="OpenFile(f.fileId)"`);
  });

  it('refuses a revoked file rather than offering a click that cannot work', () => {
    expect(component()).toMatch(/\[disabled\]="f\.isRevoked \|\| DownloadingFileId === f\.fileId"/);
  });

  it('marks for check after the await, or the spinner never clears under OnPush', () => {
    expect(component()).toMatch(/this\.cdr\.markForCheck\(\)/);
  });
});
