import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SOURCE-PRESENCE SMOKE ("the call still exists"). The behaviour is tested for real in
 * `form-asset.upload.spec.ts`, which drives `FormAssetService` over a fake XHR, and in
 * `image-optimize.spec.ts`; this only guards the seam's shape against a refactor that drops it.
 */
const code = readFileSync(join(__dirname, 'form-asset.service.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('FormAssetService uses the image optimizer — source smoke', () => {
  it('imports the optimizer from its own module', () => {
    expect(code).toMatch(/import \{ optimizeImageForUpload\b[^}]*\} from '\.\/image-optimize'/);
  });

  it('optimizes before building the multipart body, and sends the optimized file', () => {
    const optimizeAt = code.indexOf('await optimizeImageForUpload(file, use)');
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

/**
 * TEMPLATE-TEXT SMOKE: the builder's components cannot be compiled in this node Vitest, so this
 * pins the one binding that makes a page background shrink less than screen media, from the
 * Design tab down to the service call. Behaviour past the service is covered in
 * `form-asset.upload.spec.ts` and `image-optimize.spec.ts`.
 */
const read = (file: string): string => readFileSync(join(__dirname, file), 'utf8');

describe('the image use reaches the upload — template smoke', () => {
  it('marks only the Design tab background as a page background', () => {
    const html = read('design-panel.component.html');
    const bgField = html.slice(html.indexOf('ariaLabel="Background image"'), html.indexOf('/>', html.indexOf('ariaLabel="Background image"')));
    expect(bgField.length).toBeGreaterThan(0);
    expect(bgField).toContain('use="page-background"');
    expect(html.split('use="page-background"')).toHaveLength(2);
  });

  it('passes the use from the image field to the picker, and from the picker to the upload', () => {
    expect(read('image-field.component.ts')).toContain('[use]="use"');
    expect(read('image-picker-dialog.component.ts')).toMatch(/this\.assets\.upload\(file, this\.formId, \(fraction\) => \{[\s\S]*?\}, this\.use\)/);
  });

  it('tells the author large images are resized, not that everything is capped at 5 MB', () => {
    const picker = read('image-picker-dialog.component.ts');
    expect(picker).not.toContain('up to {{ sizeHint }}');
    expect(picker).toContain('{{ sizeHint }}');
    expect(picker).toMatch(/sizeHint = UPLOAD_SIZE_HINT/);
  });
});
