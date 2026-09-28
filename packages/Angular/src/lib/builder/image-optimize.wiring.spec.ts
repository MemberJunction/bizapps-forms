import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SOURCE-PRESENCE SMOKE: `FormAssetService` cannot be instantiated in this node environment
 * (XHR, Angular DI), so this guards the seam a refactor could silently drop. It checks that every
 * upload goes through the optimizer, and that the OPTIMIZED file, not the original, is what gets
 * sent. The behaviour itself is covered in `image-optimize.spec.ts`.
 */
const code = readFileSync(join(__dirname, 'form-asset.service.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('FormAssetService uses the image optimizer — source smoke', () => {
  it('imports the optimizer from its own module', () => {
    expect(code).toContain("import { optimizeImageForUpload } from './image-optimize'");
  });

  it('optimizes before building the multipart body, and sends the optimized file', () => {
    const optimizeAt = code.indexOf('await optimizeImageForUpload(file)');
    const buildAt = code.indexOf('buildAssetFormData(optimized, formId)');
    expect(optimizeAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(optimizeAt);
  });

  it('sends the original only inside the one-shot retry after a rejected type', () => {
    const firstSend = code.indexOf('buildAssetFormData(optimized, formId)');
    const retryCheck = code.indexOf('!shouldRetryWithOriginal(');
    const originalSend = code.indexOf('buildAssetFormData(file, formId)');
    expect(retryCheck).toBeGreaterThan(firstSend);
    expect(originalSend).toBeGreaterThan(retryCheck);
    expect(code.split('buildAssetFormData(file, formId)')).toHaveLength(2); // exactly one original send
  });
});
