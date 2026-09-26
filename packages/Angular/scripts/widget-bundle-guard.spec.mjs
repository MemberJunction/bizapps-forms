import { describe, it, expect } from 'vitest';
import { findServerOnlyInputs } from './widget-bundle-guard.mjs';

// Input paths are shaped like esbuild metafile keys: relative to the build's working directory
// (packages/Angular), real paths after symlinks are followed.
const STORE = '../../node_modules/.pnpm';

describe('findServerOnlyInputs', () => {
  it('passes a bundle made of the widget, Angular, zod and the forms contract', () => {
    const clean = [
      'dist/widget-entry.js',
      'dist/lib/widget/core/validation.js',
      `${STORE}/@angular+core@21.2.22/node_modules/@angular/core/fesm2022/core.mjs`,
      `${STORE}/zod@3.25.76/node_modules/zod/lib/index.mjs`,
      '../Entities/dist/contracts/index.js',
      '../Entities/dist/contracts/validation.js',
    ];
    expect(findServerOnlyInputs(clean).size).toBe(0);
  });

  it('flags MemberJunction packages installed from the store, grouped by package', () => {
    const offenders = findServerOnlyInputs([
      `${STORE}/@memberjunction+core@6.1.1/node_modules/@memberjunction/core/dist/index.js`,
      `${STORE}/@memberjunction+core@6.1.1/node_modules/@memberjunction/core/dist/generic/baseEntity.js`,
      `${STORE}/@memberjunction+global@6.1.1/node_modules/@memberjunction/global/dist/ClassUtils.js`,
    ]);
    expect([...offenders.keys()].sort()).toEqual([
      '@memberjunction/core [@memberjunction/*]',
      '@memberjunction/global [@memberjunction/*]',
    ]);
    expect(offenders.get('@memberjunction/core [@memberjunction/*]')).toHaveLength(2);
  });

  it('flags acorn, which only arrives with MJCore', () => {
    const offenders = findServerOnlyInputs([`${STORE}/acorn@8.15.0/node_modules/acorn/dist/acorn.mjs`]);
    expect([...offenders.keys()]).toEqual(['acorn [acorn]']);
  });

  it('flags the forms-entities generated modules even though the workspace link resolves them outside node_modules', () => {
    const offenders = findServerOnlyInputs([
      '../Entities/dist/generated/entity_subclasses.js',
      '../Entities/dist/generated/entities/__mj_BizAppsForms.js',
    ]);
    expect([...offenders.values()].flat()).toHaveLength(2);
    expect([...offenders.keys()].every((k) => k.endsWith('[forms-entities generated subclasses]'))).toBe(true);
  });
});
