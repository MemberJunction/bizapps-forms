/**
 * #328: the "You can submit now" line counts an upload on its way, in both renderers.
 *
 * The wiring specs can only read the renderers' source; this one EXECUTES `readyToSubmit` on a
 * real instance. Two scheduler stubs are needed to build one outside a TestBed: the renderers'
 * constructor effects ask for a change-detection scheduler and an effect scheduler. No effect has
 * to run for this computed, so both are inert. They are ɵ-exports, the same class of risk as the
 * harness's SIGNAL import: an Angular upgrade may rename them, and this spec then fails to build.
 */
import '@angular/compiler';
import { ElementRef, Injector, runInInjectionContext, ɵChangeDetectionScheduler, ɵEffectScheduler } from '@angular/core';
import { SIGNAL } from '@angular/core/primitives/signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';
import { FakeFormsApi, mountForm, screeningServer, servedAs } from '../testing/mj-form-harness';
import { FormUploadStore } from '../core/upload-store';
import { FormOneQuestionComponent } from './form-one-question.component';
import { FormScrollComponent } from './form-scroll.component';

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: () => ({ destroy: () => undefined }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A form whose ONLY question is an optional signature pad. */
function signatureOnlyForm(): PublishedFormDefinition {
  return {
    formId: 'f1', formVersionId: 'v1', name: 'Sign', renderMode: 'OneQuestion',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} }, automations: [],
    pages: [{ id: 'p1', displayOrder: 1, questions: [
      { id: 'sig', type: 'Doodle', prompt: 'sig', isRequired: false, displayOrder: 1, options: [] },
    ] }],
    endScreens: [],
  };
}
const drawing = (): File => new File(['ink'], 'doodle.png', { type: 'image/png' });

describe.each([
  ['one-question', FormOneQuestionComponent],
  ['scroll', FormScrollComponent],
] as const)('#328: readyToSubmit in the %s renderer', (_name, Renderer) => {
  it('is false with nothing answered, true while an upload is on its way, and still true once it lands', async () => {
    const { form } = await mountForm({ api: new FakeFormsApi(servedAs(signatureOnlyForm()), screeningServer) });
    const injector = Injector.create({ providers: [
      { provide: FormUploadStore, useValue: form.uploadStore },
      { provide: ElementRef, useValue: new ElementRef({}) },
      { provide: ɵChangeDetectionScheduler, useValue: { notify: () => undefined, runningTick: false } },
      { provide: ɵEffectScheduler, useValue: { add: () => undefined, schedule: () => undefined, flush: () => undefined, remove: () => undefined } },
    ] });
    const renderer = runInInjectionContext(injector, () => new Renderer());
    const node = renderer.runtime[SIGNAL] as { applyValueToInputSignal(n: unknown, v: unknown): void };
    node.applyValueToInputSignal(node, form.rt);
    // `readyToSubmit` is protected; the cast reads it without widening the component's surface.
    const ready = (renderer as unknown as { readyToSubmit(): boolean }).readyToSubmit;

    expect(ready.call(renderer)).toBe(false);

    const token = form.uploadStore.begin('sig', drawing());
    expect(ready.call(renderer)).toBe(true);

    form.uploadStore.succeed(token, 'file-sig');
    expect(ready.call(renderer)).toBe(true);
  });
});
