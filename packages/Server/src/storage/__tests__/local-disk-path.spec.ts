import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PathEscapesRootError, resolveWithinRoot } from '../local-disk-path';

const ROOT = resolve('/tmp/forms-local-storage');

describe('resolveWithinRoot', () => {
  it('resolves an ordinary object name under the root', () => {
    expect(resolveWithinRoot(ROOT, 'uploads/signature.png')).toBe(
      `${ROOT}${sep}uploads${sep}signature.png`,
    );
  });

  it('refuses to climb out with ..', () => {
    // The object name reaches this driver from an anonymous respondent's upload. On a dev
    // machine the root sits inside a working copy, so escaping it means writing over source.
    expect(() => resolveWithinRoot(ROOT, '../evil.png')).toThrow(PathEscapesRootError);
    expect(() => resolveWithinRoot(ROOT, 'uploads/../../evil.png')).toThrow(PathEscapesRootError);
  });

  it('refuses an absolute name, which would discard the root entirely', () => {
    // path.resolve('/root', '/etc/passwd') is '/etc/passwd' — the root simply vanishes.
    expect(() => resolveWithinRoot(ROOT, '/etc/passwd')).toThrow(PathEscapesRootError);
  });

  it('refuses an empty or blank name', () => {
    expect(() => resolveWithinRoot(ROOT, '')).toThrow(PathEscapesRootError);
    expect(() => resolveWithinRoot(ROOT, '   ')).toThrow(PathEscapesRootError);
  });

  it('does not mistake a sibling directory for the root', () => {
    // A bare startsWith check passes "/tmp/forms-local-storage-evil" against the root
    // "/tmp/forms-local-storage", because the string genuinely starts with it.
    expect(() => resolveWithinRoot(ROOT, '../forms-local-storage-evil/x.png')).toThrow(
      PathEscapesRootError,
    );
  });

  it('allows a nested path that merely looks alarming but stays inside', () => {
    // `a/../b` is inside the root; refusing it would be blocklisting the spelling rather
    // than checking the destination.
    expect(resolveWithinRoot(ROOT, 'a/../b.png')).toBe(`${ROOT}${sep}b.png`);
  });
});
