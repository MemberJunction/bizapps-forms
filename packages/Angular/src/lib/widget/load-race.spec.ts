/**
 * A load that resumes after the widget moved on must change nothing (#306 review finding 3).
 *
 * `load()` awaits the network. While it waits, the host can remove the element (`ngOnDestroy`) or
 * the respondent can press "Try again" (a second `load()`). The first load resuming afterwards used
 * to carry on regardless: a destroyed widget built a runtime and an autosave controller nothing
 * would ever dispose, and a stale load overwrote the newer one's form and response identity.
 */
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';
import type { RespondentFormLoad } from './api/forms-api.interface';

import { FakeFormsApi, deferred, screeningForm, screeningServer, servedAs, startMount } from './testing/mj-form-harness';

/** {@link screeningForm} with its first question renamed, so which load won is visible. */
function renamedForm(): PublishedFormDefinition {
  const form = screeningForm();
  const [first, ...rest] = form.pages;
  return { ...form, pages: [{ ...first, questions: first.questions.map((q) => (q.id === 'name' ? { ...q, id: 'second-load' } : q)) }, ...rest] };
}

describe('a load that resumes late (#306 review finding 3)', () => {
  it('builds nothing once the widget has been destroyed', async () => {
    const wire = deferred<RespondentFormLoad>();
    const api = new FakeFormsApi(() => wire.promise, screeningServer);
    const { form, loaded } = startMount({ api });

    form.ngOnDestroy();
    wire.resolve(await servedAs(screeningForm())());
    await loaded;

    expect(form.runtimeOrNull).toBeNull();
    expect(form.phaseNow).toBe('loading');
  });

  it('never overwrites the form a newer load already showed', async () => {
    const first = deferred<RespondentFormLoad>();
    const loads = [() => first.promise, servedAs(renamedForm())];
    const api = new FakeFormsApi(() => (loads.shift() ?? servedAs(renamedForm()))(), screeningServer);
    const { form, loaded } = startMount({ api });

    form.reload();
    await new Promise((resolve) => setTimeout(resolve, 0));
    first.resolve(await servedAs(screeningForm())());
    await loaded;

    const questionIds = form.rt.visiblePages()[0].questions.map((q) => q.id);
    expect(questionIds).toContain('second-load');
  });

  it('never replaces the form a newer load showed with the error page when it FAILS late', async () => {
    const first = deferred<RespondentFormLoad>();
    const loads = [() => first.promise, servedAs(renamedForm())];
    const api = new FakeFormsApi(() => (loads.shift() ?? servedAs(renamedForm()))(), screeningServer);
    const { form, loaded } = startMount({ api });

    form.reload();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const shown = form.phaseNow;
    first.reject(new Error('the first load failed after "Try again" had already succeeded'));
    await loaded;

    expect(form.phaseNow).toBe(shown);
    expect(form.phaseNow).not.toBe('error');
    expect(form.rt.visiblePages()[0].questions.map((q) => q.id)).toContain('second-load');
  });
});
