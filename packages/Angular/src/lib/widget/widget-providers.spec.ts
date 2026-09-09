import { describe, it, expect } from 'vitest';
import type { ClassProvider } from '@angular/core';

import { normalizeApiConfig } from './api/forms-api.config';
import { FORMS_API_SERVICE } from './api/forms-api.interface';
import { FORMS_UPLOAD_SERVICE } from './api/form-upload.interface';
import { FormsGraphQLApiService } from './api/forms-api.graphql.service';
import { FormsMockApiService } from './api/forms-api.mock.service';
import { FormUploadService } from './api/form-upload.service';
import { FormsMockUploadService } from './api/form-upload.mock.service';
import { formsWidgetProviders } from './widget-providers';

/** The class bound to `token` by these providers. */
function boundTo(config: Parameters<typeof formsWidgetProviders>[0], token: unknown): unknown {
  // `Provider` is a union; `useClass` is the key only its ClassProvider arm carries, so the `in`
  // check narrows to Angular's own type rather than to a hand-written lookalike.
  const entry = formsWidgetProviders(config).find(
    (p): p is ClassProvider =>
      typeof p === 'object' && p !== null && !Array.isArray(p) && 'useClass' in p && p.provide === token,
  );
  return entry?.useClass;
}

describe('formsWidgetProviders', () => {
  it('pairs the mock uploader with the mock transport when there is no endpoint', () => {
    const preview = normalizeApiConfig({ graphqlUrl: '' });

    expect(boundTo(preview, FORMS_API_SERVICE)).toBe(FormsMockApiService);
    expect(boundTo(preview, FORMS_UPLOAD_SERVICE)).toBe(FormsMockUploadService);
  });

  it('pairs the real uploader with the real transport when there is an endpoint', () => {
    const live = normalizeApiConfig({ graphqlUrl: 'https://api.example.com/graphql' });

    expect(boundTo(live, FORMS_API_SERVICE)).toBe(FormsGraphQLApiService);
    expect(boundTo(live, FORMS_UPLOAD_SERVICE)).toBe(FormUploadService);
  });
});
