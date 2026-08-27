import { describe, it, expect } from 'vitest';

import { FormUploadStore, IDLE_UPLOAD } from './upload-store';

const fileNamed = (name: string): File => new File(['x'], name);

describe('FormUploadStore — happy path', () => {
  it('shows a finished upload against the question it was made for', () => {
    const store = new FormUploadStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.succeed(token);

    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'resume.txt' });
  });

  it('does NOT show that upload against any other question', () => {
    const store = new FormUploadStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.succeed(token);

    // The defect this store exists to prevent: a recycled question component asking for a
    // DIFFERENT question must never be handed the resume's confirmation.
    expect(store.viewFor('q-transcript')).toMatchObject({ status: 'idle', fileName: '' });
  });
});

describe('FormUploadStore — superseded uploads', () => {
  it('refuses the result of an upload the respondent has already replaced', () => {
    const store = new FormUploadStore();

    const first = store.begin('q-resume', fileNamed('draft.txt'));
    const second = store.begin('q-resume', fileNamed('final.txt'));

    // `first` resolves late — a slow link, not a cancelled request.
    expect(store.succeed(first)).toBe(false);
    expect(store.viewFor('q-resume')).toMatchObject({ status: 'uploading', fileName: 'final.txt' });

    expect(store.succeed(second)).toBe(true);
    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'final.txt' });
  });
});

describe('FormUploadStore — failure', () => {
  it('shows the failure against its own question, and keeps the file for a retry', () => {
    const store = new FormUploadStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    expect(store.fail(token, 'Network unavailable.')).toBe(true);

    expect(store.viewFor('q-resume')).toMatchObject({
      status: 'error',
      error: 'Network unavailable.',
      progress: null,
    });
    expect(store.lastFileFor('q-resume')?.name).toBe('resume.txt');
  });

  it('does not let a stale failure wipe the newer upload that replaced it', () => {
    const store = new FormUploadStore();

    const first = store.begin('q-resume', fileNamed('draft.txt'));
    const second = store.begin('q-resume', fileNamed('final.txt'));
    store.succeed(second);

    // The abandoned first upload rejects afterwards. Unguarded it would blank a stored answer.
    expect(store.fail(first, 'Network unavailable.')).toBe(false);
    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'final.txt' });
  });
});

describe('FormUploadStore — clearing', () => {
  it('empties the question and retires whatever was in flight for it', () => {
    const store = new FormUploadStore();

    const token = store.begin('q-signature', fileNamed('signature.png'));
    store.clear('q-signature');

    expect(store.viewFor('q-signature')).toEqual(IDLE_UPLOAD);
    expect(store.lastFileFor('q-signature')).toBeNull();
    // A respondent who draws, dislikes it and taps Clear must not get the discarded signature
    // back when the abandoned upload resolves a moment later.
    expect(store.succeed(token)).toBe(false);
  });

  it('clears one question without touching another', () => {
    const store = new FormUploadStore();

    store.succeed(store.begin('q-transcript', fileNamed('transcript.txt')));
    store.succeed(store.begin('q-resume', fileNamed('resume.txt')));

    store.clear('q-resume');

    expect(store.viewFor('q-transcript')).toMatchObject({ status: 'done', fileName: 'transcript.txt' });
    expect(store.viewFor('q-resume')).toEqual(IDLE_UPLOAD);
  });
});

describe('FormUploadStore — progress', () => {
  it('reports progress for the running upload and ignores a superseded one', () => {
    const store = new FormUploadStore();

    const first = store.begin('q-resume', fileNamed('draft.txt'));
    store.setProgress(first, 0.5);
    expect(store.viewFor('q-resume').progress).toBe(0.5);

    const second = store.begin('q-resume', fileNamed('final.txt'));
    store.setProgress(first, 0.9);
    expect(store.viewFor('q-resume')).toMatchObject({ fileName: 'final.txt', progress: 0 });

    store.setProgress(second, 0.25);
    expect(store.viewFor('q-resume').progress).toBe(0.25);
  });
});

describe('FormUploadStore — edge cases', () => {
  it('accepts an indeterminate progress report', () => {
    const store = new FormUploadStore();

    // The uploader reports null when the transport cannot say how far along it is (no
    // Content-Length). That is a phase, not an absence of progress, and must reach the bar.
    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.setProgress(token, null);

    expect(store.viewFor('q-resume')).toMatchObject({ status: 'uploading', progress: null });
  });
});
