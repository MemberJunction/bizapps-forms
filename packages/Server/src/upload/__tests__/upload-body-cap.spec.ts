import { afterEach, describe, expect, it } from 'vitest';

import { getUploadConfig, resetUploadConfigForTests, uploadBodyCap, uploadTooLargeMessage } from '../config';

afterEach(() => resetUploadConfigForTests());

describe('the upload route body cap', () => {
  it('sits above the file cap, so the FILE check is what rejects an oversized file', () => {
    // Capping the raw body at exactly maxBytes makes the body reader the size policy by
    // accident: it fires before the file is ever inspected, so the respondent reads
    // "Upload exceeds the maximum size of 10485760 bytes" and the file check's sentence is
    // unreachable through the route. The asset route hit this and fixed it; the public
    // upload route was left with the original bug.
    expect(uploadBodyCap()).toBeGreaterThan(getUploadConfig().maxBytes);
  });

  it('leaves room for the multipart envelope, so a file at exactly the limit still fits', () => {
    // Otherwise the advertised limit is a lie by the size of the boundary and headers.
    expect(uploadBodyCap() - getUploadConfig().maxBytes).toBeGreaterThanOrEqual(1024);
  });

  it('states the limit the same way wherever the rejection comes from', () => {
    // Two layers can refuse an oversized upload. A respondent must not be able to tell
    // which one fired, because the limit they were told about is the same either way.
    expect(uploadTooLargeMessage()).toMatch(/\bMB\b/);
    expect(uploadTooLargeMessage()).not.toMatch(/\d{7,}/);
  });
});
