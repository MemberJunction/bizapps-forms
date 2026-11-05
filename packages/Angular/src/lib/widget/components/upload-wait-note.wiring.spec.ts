/**
 * Both renderers show the upload-wait note while a file on the CURRENT step is uploading, and only
 * then. Executes the renderers' `uploadWaitNote` computed on real instances, built the way
 * `ready-to-submit-uploads.spec.ts` builds them (see the scheduler-stub note there).
 *
 * The last block reads template text: it asserts the note is rendered, in a polite live region that
 * is always present — presence only, as the source-text tests in this package are titled.
 */
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ElementRef, Injector, runInInjectionContext, ɵChangeDetectionScheduler, ɵEffectScheduler } from '@angular/core';
import { SIGNAL } from '@angular/core/primitives/signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedFormDefinition, PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';

import { FakeFormsApi, mountForm, screeningServer, servedAs, type MjFormHarness } from '../testing/mj-form-harness';
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

const question = (id: string, type: PublishedFormQuestion['type']): PublishedFormQuestion => ({
  id, type, prompt: id, isRequired: false, displayOrder: 1, options: [],
});

/** Two steps in either mode: a résumé, then a last question — or, with `resumeLast`, the other way round. */
function applicationForm(renderMode: 'Scroll' | 'OneQuestion', resumeLast: boolean): PublishedFormDefinition {
  const resume = question('resume', 'FileUpload');
  const name = question('name', 'ShortText');
  const [first, second] = resumeLast ? [name, resume] : [resume, name];
  return {
    formId: 'f1', formVersionId: 'v1', name: 'Apply', renderMode,
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} }, automations: [],
    pages: [
      { id: 'p1', displayOrder: 1, questions: [{ ...first, displayOrder: 1 }] },
      { id: 'p2', displayOrder: 2, questions: [{ ...second, displayOrder: 1 }] },
    ],
    endScreens: [],
  };
}

type Renderer = typeof FormOneQuestionComponent | typeof FormScrollComponent;

async function rendererFor(Renderer: Renderer, definition: PublishedFormDefinition): Promise<{
  form: MjFormHarness;
  note: () => string | null;
  goToLastStep: () => void;
}> {
  const { form } = await mountForm({ api: new FakeFormsApi(servedAs(definition), screeningServer) });
  const injector = Injector.create({ providers: [
    { provide: FormUploadStore, useValue: form.uploadStore },
    { provide: ElementRef, useValue: new ElementRef({}) },
    { provide: ɵChangeDetectionScheduler, useValue: { notify: () => undefined, runningTick: false } },
    { provide: ɵEffectScheduler, useValue: { add: () => undefined, schedule: () => undefined, flush: () => undefined, remove: () => undefined } },
  ] });
  const renderer = runInInjectionContext(injector, () => new Renderer());
  const node = renderer.runtime[SIGNAL] as { applyValueToInputSignal(n: unknown, v: unknown): void };
  node.applyValueToInputSignal(node, form.rt);
  // Both are protected; the cast reads them without widening the components' surface.
  const internals = renderer as unknown as { uploadWaitNote(): string | null; index: { set(i: number): void } };
  return {
    form,
    note: () => internals.uploadWaitNote.call(renderer),
    goToLastStep: () => internals.index.set(1),
  };
}

const resumeFile = (): File => new File(['cv'], 'resume.pdf', { type: 'application/pdf' });

describe.each([
  ['one-question', FormOneQuestionComponent, 'OneQuestion'],
  ['scroll', FormScrollComponent, 'Scroll'],
] as const)('the upload-wait note in the %s renderer', (_name, Renderer, mode) => {
  it('appears on the last step while its file uploads, names Submit, and goes once the file is saved', async () => {
    const { form, note, goToLastStep } = await rendererFor(Renderer, applicationForm(mode, true));
    goToLastStep();
    expect(note()).toBeNull();

    const token = form.uploadStore.begin('resume', resumeFile());
    expect(note()).toMatch(/still uploading.*Submit/);

    form.uploadStore.succeed(token, 'file-resume');
    expect(note()).toBeNull();
  });

  it('goes away while a press waits on the upload, and does not come back when it lands', async () => {
    const { form, note, goToLastStep } = await rendererFor(Renderer, applicationForm(mode, true));
    goToLastStep();
    const token = form.uploadStore.begin('resume', resumeFile());
    expect(note()).not.toBeNull();

    // A Submit or Next waiting on the upload is what `whenSettled` is.
    const waiting = form.uploadStore.whenSettled(['resume']);
    expect(note()).toBeNull();

    form.uploadStore.succeed(token, 'file-resume');
    await waiting;
    expect(note()).toBeNull();
  });

  it('names Next on an earlier step', async () => {
    const { form, note } = await rendererFor(Renderer, applicationForm(mode, false));
    form.uploadStore.begin('resume', resumeFile());
    expect(note()).toMatch(/still uploading.*Next/);
  });

  it('ignores an upload that belongs to a different step', async () => {
    const { form, note } = await rendererFor(Renderer, applicationForm(mode, true));
    // On step one (the name); the résumé on step two is uploading.
    form.uploadStore.begin('resume', resumeFile());
    expect(note()).toBeNull();
  });
});

describe('the upload-wait note is rendered beside the primary button (source text: presence only)', () => {
  const template = (file: string): string =>
    readFileSync(join(__dirname, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

  it.each(['form-scroll.component.html', 'form-one-question.component.html'])('%s', (file) => {
    const html = template(file);
    // Always rendered, content conditional: a region inserted together with its text is not
    // reliably announced.
    expect(html).toMatch(/<p class="mjf-wait-note" aria-live="polite">\s*@if \(uploadWaitNote\(\); as note\)/);
  });
});
