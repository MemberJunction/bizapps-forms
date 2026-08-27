import { describe, it, expect } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

import { FormRuntime } from './form-runtime';
import { FormUploadStore, IDLE_UPLOAD } from './upload-store';

const fileNamed = (name: string): File => new File(['x'], name);

/** Two file questions, so "the wrong one" is a place an answer can actually land. */
function uploadForm(): PublishedFormDefinition {
  const fileQuestion = (id: string, order: number) => ({
    id,
    type: 'FileUpload' as const,
    prompt: id,
    isRequired: false,
    displayOrder: order,
    options: [],
  });
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Uploads',
    renderMode: 'OneQuestion',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    pages: [{ id: 'p1', displayOrder: 1, questions: [fileQuestion('q-resume', 1), fileQuestion('q-transcript', 2)] }],
    endScreens: [],
  };
}

/**
 * A store wired to a real `FormRuntime`, which is the only wiring that ships.
 *
 * The runtime rather than a stand-in on purpose: the store's whole job is to put an answer
 * somewhere the rest of the widget reads it, and a fake sink would let the two drift on what
 * "no answer" means.
 */
function connectedStore(): { store: FormUploadStore; runtime: FormRuntime } {
  const runtime = new FormRuntime(uploadForm());
  const store = new FormUploadStore();
  store.connect(runtime);
  return { store, runtime };
}

describe('FormUploadStore — happy path', () => {
  it('shows a finished upload against the question it was made for', () => {
    const { store } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.succeed(token, 'file-resume');

    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'resume.txt' });
  });

  it('does NOT show that upload against any other question', () => {
    const { store } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.succeed(token, 'file-resume');

    // The defect this store exists to prevent: a recycled question component asking for a
    // DIFFERENT question must never be handed the resume's confirmation.
    expect(store.viewFor('q-transcript')).toMatchObject({ status: 'idle', fileName: '' });
  });
});

describe('FormUploadStore — the answer, not just the confirmation', () => {
  it('stores a finished upload against the question it was made for, even after the respondent moved on', () => {
    const { store, runtime } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.pdf'));
    // OneQuestion renders the whole deck through ONE component instance, so by the time a slow
    // upload resolves that instance is bound to the NEXT question. The upload is still the
    // resume's, and so is the answer.
    store.succeed(token, 'file-resume');

    expect(runtime.valueFor('q-resume')).toBe('file-resume');
    expect(runtime.valueFor('q-transcript')).toBeUndefined();
  });

  it('leaves the question unanswered while its upload is in flight', () => {
    const { store, runtime } = connectedStore();

    store.succeed(store.begin('q-resume', fileNamed('first.pdf')), 'file-first');
    store.begin('q-resume', fileNamed('second.pdf'));

    // A required FileUpload must not be satisfiable by a file that is not stored yet, and the
    // replaced file's id must not stand while its replacement uploads.
    expect(runtime.valueFor('q-resume')).toBeUndefined();
  });

  it('refuses to store an upload when nothing is listening for the answer', () => {
    const store = new FormUploadStore();

    // Loud, because the alternative is a respondent submitting a form without the file they
    // attached and nobody finding out.
    expect(() => store.begin('q-resume', fileNamed('resume.pdf'))).toThrow(/no answer sink/);
  });

  it('drops the previous form’s uploads when it is connected to a new runtime', () => {
    const { store, runtime } = connectedStore();
    store.succeed(store.begin('q-resume', fileNamed('resume.pdf')), 'file-resume');

    store.connect(new FormRuntime(uploadForm()));

    // A reload mints a new response id; a confirmation carried across would name a file that
    // response never had.
    expect(store.viewFor('q-resume')).toEqual(IDLE_UPLOAD);
    expect(runtime.valueFor('q-resume')).toBe('file-resume');
  });
});

describe('FormUploadStore — superseded uploads', () => {
  it('refuses the result of an upload the respondent has already replaced', () => {
    const { store, runtime } = connectedStore();

    const first = store.begin('q-resume', fileNamed('draft.txt'));
    const second = store.begin('q-resume', fileNamed('final.txt'));

    // `first` resolves late — a slow link, not a cancelled request.
    store.succeed(first, 'file-draft');
    expect(store.viewFor('q-resume')).toMatchObject({ status: 'uploading', fileName: 'final.txt' });
    expect(runtime.valueFor('q-resume')).toBeUndefined();

    store.succeed(second, 'file-final');
    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'final.txt' });
    expect(runtime.valueFor('q-resume')).toBe('file-final');
  });
});

describe('FormUploadStore — failure', () => {
  it('shows the failure against its own question, and keeps the file for a retry', () => {
    const { store, runtime } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.fail(token, 'Network unavailable.');

    expect(store.viewFor('q-resume')).toMatchObject({
      status: 'error',
      error: 'Network unavailable.',
      progress: null,
    });
    expect(store.lastFileFor('q-resume')?.name).toBe('resume.txt');
    expect(runtime.valueFor('q-resume')).toBeUndefined();
  });

  it('does not let a stale failure wipe the newer upload that replaced it', () => {
    const { store, runtime } = connectedStore();

    const first = store.begin('q-resume', fileNamed('draft.txt'));
    const second = store.begin('q-resume', fileNamed('final.txt'));
    store.succeed(second, 'file-final');

    store.fail(first, 'Network unavailable.');

    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'final.txt' });
    expect(runtime.valueFor('q-resume')).toBe('file-final');
  });
});

describe('FormUploadStore — clearing', () => {
  it('empties the question and retires whatever was in flight for it', () => {
    const { store, runtime } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.clear('q-resume');

    expect(store.viewFor('q-resume')).toEqual(IDLE_UPLOAD);
    expect(store.lastFileFor('q-resume')).toBeNull();

    // The respondent said they do not want this file; the upload already on the wire still
    // resolves, and must change nothing.
    store.succeed(token, 'file-resume');
    expect(store.viewFor('q-resume')).toEqual(IDLE_UPLOAD);
    expect(runtime.valueFor('q-resume')).toBeUndefined();
  });

  it('clears one question without touching another', () => {
    const { store, runtime } = connectedStore();

    store.succeed(store.begin('q-resume', fileNamed('resume.txt')), 'file-resume');
    store.succeed(store.begin('q-transcript', fileNamed('transcript.txt')), 'file-transcript');

    store.clear('q-transcript');

    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'resume.txt' });
    expect(runtime.valueFor('q-resume')).toBe('file-resume');
    expect(runtime.valueFor('q-transcript')).toBeUndefined();
  });
});

describe('FormUploadStore — progress', () => {
  it('reports progress for the running upload and ignores a superseded one', () => {
    const { store } = connectedStore();

    const first = store.begin('q-resume', fileNamed('draft.txt'));
    store.setProgress(first, 0.5);
    expect(store.viewFor('q-resume').progress).toBe(0.5);

    const second = store.begin('q-resume', fileNamed('final.txt'));
    store.setProgress(first, 0.9);
    expect(store.viewFor('q-resume').progress).toBe(0);

    store.setProgress(second, 0.3);
    expect(store.viewFor('q-resume').progress).toBe(0.3);
  });
});

describe('FormUploadStore — edge cases', () => {
  it('accepts an indeterminate progress report', () => {
    const { store } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    // Not "no progress" — the transport says it cannot tell, and the bar renders indeterminate.
    store.setProgress(token, null);

    expect(store.viewFor('q-resume')).toMatchObject({ status: 'uploading', progress: null });
  });

  it('reports an untouched question as idle', () => {
    const { store } = connectedStore();

    expect(store.viewFor('q-never-touched')).toEqual(IDLE_UPLOAD);
  });
});
