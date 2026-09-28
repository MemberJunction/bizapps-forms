import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SOURCE-PRESENCE SMOKE for the builder's #270 wiring — it asserts the calls still exist, not
 * that they behave. These components cannot be instantiated in the vitest node env (no Angular
 * JIT), so the behaviour is covered where it lives: `widget/core/asset-ref.spec.ts` for the pure
 * transforms and `snapshot-builder.spec.ts` for publish. What this guards is the seam a refactor
 * could silently drop — a builder that stores the uploading API's absolute URL again, or a preview
 * that renders a stored `/forms/asset/<id>` against Explorer's origin and 404s.
 */
const here = __dirname;
const code = (file: string): string =>
  readFileSync(join(here, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('builder asset references (#270) — source smoke', () => {
  it('the image picker still stores an uploaded image as a host-independent reference', () => {
    expect(code('image-picker-dialog.component.ts')).toContain('this.picked.emit(toAssetRef(asset.url))');
  });

  it('the image field thumbnail still resolves the stored reference against the API base', () => {
    const field = code('image-field.component.ts');
    expect(field).toContain('[src]="previewSrc"');
    expect(field).toContain('resolveAssetUrl(this.value, resolveApiBase())');
  });

  it('the preview stage still resolves the definition and the preview style before rendering', () => {
    const stage = code('form-preview-stage.component.ts');
    expect(stage).toContain('[definition]="renderDefinition()"');
    expect(stage).toContain('mapDefinitionAssets(this.definition(), resolveForBuilder)');
    expect(stage).toContain('mapStyleTokenAssets(tokens, resolveForBuilder)');
  });

  it('the preview stage resolves against the API BASE, not the bare origin', () => {
    // An MJAPI behind a path prefix serves `/api/forms/asset/<id>`; the origin alone 404s.
    const stage = code('form-preview-stage.component.ts');
    expect(stage).toContain('resolveAssetUrl(url, resolveApiBase())');
    expect(stage).not.toContain('resolveApiOrigin');
  });

  it('the asset upload posts to the API BASE, so a prefix-deployed MJAPI receives it', () => {
    const service = code('form-asset.service.ts');
    expect(service).toContain('resolveApiBase()');
    expect(service).not.toContain('resolveApiOrigin');
  });
});
