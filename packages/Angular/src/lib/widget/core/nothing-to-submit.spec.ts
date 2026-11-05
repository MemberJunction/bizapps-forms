import { describe, it, expect } from 'vitest';
import type { PublishedFormDefinition, PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';

import { FormRuntime } from './form-runtime';
import { nothingToSubmit } from './nothing-to-submit';
import { FormUploadStore, UPLOAD_UNSAVED_MESSAGE } from './upload-store';
import { fullForm } from './widget-form';

const question = (id: string, type: PublishedFormQuestion['type'], order: number): PublishedFormQuestion => ({
  id,
  type,
  prompt: id,
  isRequired: false,
  displayOrder: order,
  options: [],
});

const definitionOf = (questions: PublishedFormQuestion[]): PublishedFormDefinition => ({
  formId: 'f1',
  formVersionId: 'v1',
  name: 'Nothing to submit',
  renderMode: 'Scroll',
  settings: { anonymousAllowed: true, captchaRequired: false },
  styleTokens: { cssVariables: {} },
  automations: [],
  pages: [{ id: 'p1', displayOrder: 1, questions }],
  endScreens: [],
});

/** A real runtime with a real store connected to it, which is the only wiring that ships. */
function wired(questions: PublishedFormQuestion[]): { runtime: FormRuntime; store: FormUploadStore } {
  const runtime = new FormRuntime(fullForm(definitionOf(questions)));
  const store = new FormUploadStore();
  store.connect(runtime);
  return { runtime, store };
}

const file = new File(['x'], 'doodle.png');

describe('nothingToSubmit', () => {
  it('is true when the only question is an optional doodle nobody touched', () => {
    const { runtime, store } = wired([question('doodle', 'Doodle', 1)]);
    expect(nothingToSubmit(runtime, store)).toBe(true);
  });

  it('is false while that doodle is uploading: an answer is on its way', () => {
    const { runtime, store } = wired([question('doodle', 'Doodle', 1)]);
    store.begin('doodle', file);
    expect(nothingToSubmit(runtime, store)).toBe(false);
  });

  it('is false when that upload ended unsaved: a submit restarts it', () => {
    const { runtime, store } = wired([question('doodle', 'Doodle', 1)]);
    store.fail(store.begin('doodle', file), { kind: 'unsaved', message: UPLOAD_UNSAVED_MESSAGE });
    expect(nothingToSubmit(runtime, store)).toBe(false);
  });

  it('stays true when that upload was refused: no answer is coming', () => {
    const { runtime, store } = wired([question('doodle', 'Doodle', 1)]);
    store.fail(store.begin('doodle', file), { kind: 'refused', message: 'Too big.' });
    expect(nothingToSubmit(runtime, store)).toBe(true);
  });

  it('is false when another question holds a stored answer', () => {
    const { runtime, store } = wired([question('doodle', 'Doodle', 1), question('note', 'ShortText', 2)]);
    runtime.setValue('note', 'hello');
    expect(nothingToSubmit(runtime, store)).toBe(false);
  });

  it('ignores a pending upload on a question a rule has hidden', () => {
    const hiddenDoodle: PublishedFormQuestion = {
      ...question('doodle', 'Doodle', 2),
      conditionalRule: { show: { all: [{ questionId: 'gate', op: 'equals', value: 'yes' }] } },
    };
    const { runtime, store } = wired([question('gate', 'ShortText', 1), hiddenDoodle]);
    store.begin('doodle', file);
    expect(nothingToSubmit(runtime, store)).toBe(true);
  });
});
