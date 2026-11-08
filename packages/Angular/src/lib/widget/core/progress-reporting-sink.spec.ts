import { describe, expect, it, vi } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';

import { FormRuntime } from './form-runtime';
import { progressReportingSink } from './progress-reporting-sink';
import { FormUploadStore, type UploadAnswerSink } from './upload-store';
import { fullForm } from './widget-form';

describe('progressReportingSink', () => {
  it('writes the answer to the runtime, then reports progress once', () => {
    const calls: string[] = [];
    const runtime: UploadAnswerSink = { setValue: (id, value) => calls.push(`set ${id}=${String(value)}`) };

    progressReportingSink(runtime, () => calls.push('progress')).setValue('q1', 'file-1');

    expect(calls).toEqual(['set q1=file-1', 'progress']);
  });

  it('reports progress for a cleared answer too', () => {
    const onProgress = vi.fn();
    const runtime: UploadAnswerSink = { setValue: vi.fn() };

    progressReportingSink(runtime, onProgress).setValue('q1', null);

    expect(runtime.setValue).toHaveBeenCalledWith('q1', null);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});

/** The wiring `mj-form.component.ts` ships, minus the component (it needs `inject()`). */
describe('FormUploadStore connected through progressReportingSink', () => {
  const definition: PublishedFormDefinition = {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Uploads',
    renderMode: 'OneQuestion',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [{ id: 'q-file', type: 'FileUpload', prompt: 'File', isRequired: false, displayOrder: 1, options: [] }],
      },
    ],
    endScreens: [],
  };

  function wired() {
    const runtime = new FormRuntime(fullForm(definition));
    const onProgress = vi.fn();
    const store = new FormUploadStore();
    store.connect(progressReportingSink(runtime, onProgress));
    return { store, runtime, onProgress };
  }

  it('reports progress when an upload lands and again when it is cleared', () => {
    const { store, runtime, onProgress } = wired();

    // `begin` itself commits `null` (it retires the previous answer), so it reports too; the
    // count that matters is what `succeed` adds.
    const token = store.begin('q-file', new File(['x'], 'a.txt'));
    onProgress.mockClear();
    store.succeed(token, 'file-a');
    expect(runtime.valueFor('q-file')).toBe('file-a');
    expect(onProgress).toHaveBeenCalledTimes(1);

    store.clear('q-file');
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('stays silent for a superseded upload', () => {
    const { store, runtime, onProgress } = wired();

    const stale = store.begin('q-file', new File(['x'], 'old.txt'));
    store.clear('q-file');
    onProgress.mockClear();
    store.succeed(stale, 'file-old');

    expect(runtime.valueFor('q-file')).toBeUndefined();
    expect(onProgress).not.toHaveBeenCalled();
  });
});
