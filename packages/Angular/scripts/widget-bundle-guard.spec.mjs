import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { findServerOnlyInputs, createPackageNameResolver } from './widget-bundle-guard.mjs';

// A real on-disk tree, because the rule is about path SHAPES only a filesystem produces. It holds
// both install layouts the widget is built in: a store install (CI, a worktree with its own
// `pnpm install`), where every package sits under `node_modules/<name>/`, and the mj-dev
// workspace, which links `@memberjunction/*` to `MJ/packages/<Dir>/` — a directory not named after
// the package. Inputs are written the way esbuild's metafile keys them: relative to the build's
// working directory (packages/Angular), real paths after symlinks are followed.
const root = mkdtempSync(join(tmpdir(), 'widget-guard-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
function write(rel, text = '') {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
const pkg = (rel, manifest) => write(`${rel}/package.json`, JSON.stringify(manifest));

const STORE = 'forms/node_modules/.pnpm';
pkg(`${STORE}/@memberjunction+core@6.1.1/node_modules/@memberjunction/core`, { name: '@memberjunction/core' });
pkg(`${STORE}/@memberjunction+global@6.1.1/node_modules/@memberjunction/global`, { name: '@memberjunction/global' });
pkg(`${STORE}/acorn@8.15.0/node_modules/acorn`, { name: 'acorn' });
pkg(`${STORE}/zod@3.25.76/node_modules/zod`, { name: 'zod' });
pkg(`${STORE}/@angular+core@21.2.22/node_modules/@angular/core`, { name: '@angular/core' });
pkg('MJ/packages/MJExportEngine', { name: '@memberjunction/export-engine' });
pkg('MJ/packages/MJCore', { name: '@memberjunction/core' });
pkg('MJ/packages/MJCore/dist/esm', { type: 'module' }); // a nameless stub, as many dists carry
pkg('forms/packages/Angular', { name: '@mj-biz-apps/forms-ng' });
pkg('forms/packages/Entities', { name: '@mj-biz-apps/forms-entities' });

const cwd = join(root, 'forms/packages/Angular');
const inStore = (p) => `../../node_modules/.pnpm/${p}`;
const inMJ = (p) => `../../../MJ/packages/${p}`;
const find = (inputs) => findServerOnlyInputs(inputs, createPackageNameResolver(cwd));

describe('findServerOnlyInputs', () => {
  it('passes a bundle made of the widget, Angular, zod and the forms contract', () => {
    const clean = [
      'dist/widget-entry.js',
      'dist/lib/widget/core/validation.js',
      inStore('@angular+core@21.2.22/node_modules/@angular/core/fesm2022/core.mjs'),
      inStore('zod@3.25.76/node_modules/zod/lib/index.mjs'),
      '../Entities/dist/contracts/index.js',
      '../Entities/dist/contracts/validation.js',
    ];
    expect(find(clean).size).toBe(0);
  });

  it('flags MemberJunction packages installed from the store, grouped by package', () => {
    const offenders = find([
      inStore('@memberjunction+core@6.1.1/node_modules/@memberjunction/core/dist/index.js'),
      inStore('@memberjunction+core@6.1.1/node_modules/@memberjunction/core/dist/generic/baseEntity.js'),
      inStore('@memberjunction+global@6.1.1/node_modules/@memberjunction/global/dist/ClassUtils.js'),
    ]);
    expect([...offenders.keys()].sort()).toEqual([
      '@memberjunction/core [@memberjunction/*]',
      '@memberjunction/global [@memberjunction/*]',
    ]);
    expect(offenders.get('@memberjunction/core [@memberjunction/*]')).toHaveLength(2);
  });

  it('flags a MemberJunction package linked from MJ source (the mj-dev workspace layout)', () => {
    // #245 follow-up: the path-substring rule passed this bundle in the workspace (exit 0,
    // 966 KB of @memberjunction/export-engine) and failed it only in a store install.
    const offenders = find([inMJ('MJExportEngine/dist/types.js'), 'dist/widget-entry.js']);
    expect([...offenders.keys()]).toEqual(['@memberjunction/export-engine [@memberjunction/*]']);
  });

  it('names the package past a nameless nested package.json', () => {
    const offenders = find([inMJ('MJCore/dist/esm/index.js')]);
    expect([...offenders.keys()]).toEqual(['@memberjunction/core [@memberjunction/*]']);
  });

  it('flags acorn, which only arrives with MJCore', () => {
    const offenders = find([inStore('acorn@8.15.0/node_modules/acorn/dist/acorn.mjs')]);
    expect([...offenders.keys()]).toEqual(['acorn [acorn]']);
  });

  it('flags the forms-entities generated modules but not the contract beside them', () => {
    const offenders = find([
      '../Entities/dist/generated/entity_subclasses.js',
      '../Entities/dist/generated/entities/__mj_BizAppsForms.js',
      '../Entities/dist/contracts/index.js',
    ]);
    expect([...offenders.keys()]).toEqual(['@mj-biz-apps/forms-entities [forms-entities generated subclasses]']);
    expect(offenders.get('@mj-biz-apps/forms-entities [forms-entities generated subclasses]')).toHaveLength(2);
  });
});

describe('createPackageNameResolver', () => {
  it('names the manifest it could not parse, rather than failing the build with a bare SyntaxError', () => {
    write('broken/package.json', '{ not json');
    write('broken/index.js');
    expect(() => createPackageNameResolver(join(root, 'broken'))('index.js')).toThrow(/broken\/package\.json/);
  });

  it('returns undefined for an input no named package owns', () => {
    write('loose/file.js');
    expect(createPackageNameResolver(join(root, 'loose'))('file.js')).toBeUndefined();
  });
});
