import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const src = readFileSync(join(__dirname, 'mj-loader.component.ts'), 'utf8');

describe('mjf-mj-loader — source smoke', () => {
  it('draws the MJ mark inline, because the host page loads no icon font or MJ stylesheet', () => {
    expect(src).toContain("selector: 'mjf-mj-loader'");
    expect(src).toContain('viewBox="0 0 230 128"');
    expect(src).toContain('transform="translate(47.5625,10.875)"');
    expect(src).toContain('transform="translate(150,69)"');
    expect(src).not.toMatch(/\bfa-[a-z]/);
    expect(src).not.toContain('@memberjunction/ng-');
  });
  it('colours the mark from a token, never a literal', () => {
    expect(src).toMatch(/fill:\s*var\(--mjf-accent\)/);
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it('stops pulsing for a respondent who asked for reduced motion', () => {
    expect(src).toContain('prefers-reduced-motion: reduce');
  });
  it('is decorative: the status text beside it is what a screen reader announces', () => {
    expect(src).toContain('aria-hidden="true"');
  });
});
