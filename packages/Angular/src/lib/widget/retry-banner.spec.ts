/**
 * "Try again" after a failed load gives a clean form.
 *
 * A failed load writes its message to `errorText` for the error page. The same signal also feeds the
 * form's `role="alert"` banner, so when the retried load succeeded the respondent was shown the old
 * failure ("Failed to fetch") above a form that had loaded fine — and a screen reader announced it.
 */
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { API_UNREACHABLE_LOAD_MESSAGE, FormsApiUnreachableError, type RespondentFormLoad } from './api/forms-api.interface';

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

describe('an unreachable network on the first load', () => {
  it('shows the load sentence, never the save sentence that promises kept answers', async () => {
    const api = new FakeFormsApi(() => Promise.reject(new FormsApiUnreachableError('TypeError: Failed to fetch')), screeningServer);
    const { form, loaded } = startMount({ api });
    await loaded;
    expect(form.phaseNow).toBe('error');
    expect(form.bannerText).toBe(API_UNREACHABLE_LOAD_MESSAGE);
    expect(form.bannerText).not.toContain('Your answers are still here');
  });
});
