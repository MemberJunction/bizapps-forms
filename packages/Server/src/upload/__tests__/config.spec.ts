/**
 * Unit tests for the upload endpoint configuration + content-type allowlist matching.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contentTypeAllowed, getUploadConfig, resetUploadConfigForTests } from '../config';

const SAVED = { ...process.env };

beforeEach(() => resetUploadConfigForTests());
afterEach(() => {
  process.env = { ...SAVED };
  resetUploadConfigForTests();
});

describe('getUploadConfig', () => {
  it('defaults: enabled, 10 MiB cap, sensible allowlist', () => {
    delete process.env.FORMS_UPLOAD_ENABLED;
    delete process.env.FORMS_UPLOAD_MAX_BYTES;
    delete process.env.FORMS_UPLOAD_ALLOWED_TYPES;
    const cfg = getUploadConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.maxBytes).toBe(10 * 1024 * 1024);
    expect(cfg.allowedTypes).toContain('application/pdf');
  });

  it('honors env overrides', () => {
    process.env.FORMS_UPLOAD_ENABLED = 'false';
    process.env.FORMS_UPLOAD_MAX_BYTES = '2048';
    process.env.FORMS_UPLOAD_ALLOWED_TYPES = 'image/*, text/plain';
    const cfg = getUploadConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.maxBytes).toBe(2048);
    expect(cfg.allowedTypes).toEqual(['image/*', 'text/plain']);
  });

  it('falls back to the default cap on a non-numeric override', () => {
    process.env.FORMS_UPLOAD_MAX_BYTES = 'not-a-number';
    expect(getUploadConfig().maxBytes).toBe(10 * 1024 * 1024);
  });
});

describe('contentTypeAllowed', () => {
  const allowed = ['image/png', 'application/pdf', 'text/*'];
  it('matches an exact type', () => {
    expect(contentTypeAllowed('image/png', allowed)).toBe(true);
  });
  it('matches a family wildcard', () => {
    expect(contentTypeAllowed('text/csv', allowed)).toBe(true);
  });
  it('ignores a charset parameter', () => {
    expect(contentTypeAllowed('text/plain; charset=utf-8', allowed)).toBe(true);
  });
  it('rejects a disallowed type (fail-closed)', () => {
    expect(contentTypeAllowed('application/x-msdownload', allowed)).toBe(false);
  });
  it('rejects a blank/undefined type (fail-closed)', () => {
    expect(contentTypeAllowed(undefined, allowed)).toBe(false);
    expect(contentTypeAllowed('', allowed)).toBe(false);
  });
});
