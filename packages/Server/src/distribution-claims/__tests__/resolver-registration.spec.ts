import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('FormDistributionClaims registration', () => {
  it('is discovered by RESOLVER_PATHS', () => {
    const index = readFileSync(resolve(__dirname, '../../index.ts'), 'utf8');
    expect(index).toMatch(/distribution-claims\/\*Resolver\.\{js,ts\}/);
  });
});
