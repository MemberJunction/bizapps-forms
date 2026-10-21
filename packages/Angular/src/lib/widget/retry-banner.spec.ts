/**
 * "Try again" after a failed load gives a clean form.
 *
 * A failed load writes its message to `errorText` for the error page. The same signal also feeds the
 * form's `role="alert"` banner, so when the retried load succeeded the respondent was shown the old
 * failure ("Failed to fetch") above a form that had loaded fine — and a screen reader announced it.
 */
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { RespondentFormLoad } from './api/forms-api.interface';

import { FakeFormsApi, screeningForm, screeningServer, servedAs, startMount } from './testing/mj-form-harness';

describe('"Try again" after a failed load', () => {
  it('clears the failed load\'s message once the retried load succeeds', async () => {
    const loads: Array<() => Promise<RespondentFormLoad>> = [
      () => Promise.reject(new Error('Failed to fetch')),
      servedAs(screeningForm()),
    ];
    const api = new FakeFormsApi(() => (loads.shift() ?? servedAs(screeningForm()))(), screeningServer);
    const { form, loaded } = startMount({ api });
    await loaded;
    expect(form.phaseNow).toBe('error');
    expect(form.bannerText).toBe('Failed to fetch');

    form.reload();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(form.phaseNow).not.toBe('error');
    expect(form.rt.visiblePages().length).toBeGreaterThan(0);
    expect(form.bannerText).toBe('');
  });
});
