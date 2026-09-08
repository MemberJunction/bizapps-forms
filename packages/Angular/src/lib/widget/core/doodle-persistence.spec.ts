/**
 * The defect: a drawing made in section two is GONE after Back then Next.
 *
 * What "gone" means is the whole diagnosis. The ANSWER survives — `FormUploadStore` commits the
 * uploaded file id straight into the runtime, and nothing on the navigation path clears it. What
 * does not survive is the DRAWING: the pad holds its ink in a canvas bitmap and a private
 * `hasInk` signal, both of which die with the component when the section is left. Coming back
 * constructs a NEW pad, and a new pad has nothing to render from — so the respondent is shown an
 * empty box reading "Draw here." over an answer that is, in fact, stored.
 *
 * Every other control in `form-question.component.html` renders from `value()`. The doodle pad is
 * the one that renders from itself, which is why it is the one that loses its contents.
 *
 * These tests fix the property that removes the whole class: whatever the widget still knows
 * about a question after its control is destroyed must be enough to put the control back on
 * screen showing the same thing. They exercise the real store against the real runtime, because
 * the wiring between those two IS the thing that has to survive the trip.
 */
import { describe, it, expect } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

import { FormRuntime } from './form-runtime';
import { FormUploadStore } from './upload-store';

/** A stand-in for the PNG the pad exports on every stroke. */
const drawing = (bytes = 'ink'): File =>
  new File([bytes], 'doodle.png', { type: 'image/png' });

/**
 * Section 1: a name. Section 2: two drawings and a file upload.
 *
 * Two doodle questions rather than one because "the wrong question's drawing" is a place a repaint
 * can land — OneQuestion mode renders the whole deck through one component instance, so two
 * consecutive Doodle questions are served by the SAME pad.
 */
function twoSectionForm(): PublishedFormDefinition {
  const question = (id: string, type: 'ShortText' | 'Doodle' | 'FileUpload', order: number) => ({
    id,
    type,
    prompt: id,
    isRequired: false,
    displayOrder: order,
    options: [],
  });
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Consent',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    pages: [
      { id: 'p1', displayOrder: 1, questions: [question('q-name', 'ShortText', 1)] },
      {
        id: 'p2',
        displayOrder: 2,
        questions: [
          question('q-draw', 'Doodle', 1),
          question('q-redraw', 'Doodle', 2),
          question('q-id-scan', 'FileUpload', 3),
        ],
      },
    ],
    endScreens: [],
  };
}

function connectedStore(): { store: FormUploadStore; runtime: FormRuntime } {
  const runtime = new FormRuntime(twoSectionForm());
  const store = new FormUploadStore();
  store.connect(runtime);
  return { store, runtime };
}

/**
 * Draw something and let its upload finish — the exact sequence
 * `FormQuestionComponent.uploadFile` runs.
 */
function draw(store: FormUploadStore, questionId: string, ink = 'ink'): File {
  const png = drawing(ink);
  const token = store.begin(questionId, png);
  store.succeed(token, `file-${questionId}`);
  return png;
}

describe('a drawing made in section two survives Back then Next', () => {
  it('leaves the answer in place — this half already worked', () => {
    const { store, runtime } = connectedStore();
    runtime.setValue('q-name', 'Ada');

    draw(store, 'q-draw');

    // Back and Next destroy and re-create the section's controls; they touch no answer.
    expect(runtime.valueFor('q-draw')).toBe('file-q-draw');
    expect(runtime.valueFor('q-name')).toBe('Ada');
  });

  it('leaves the DRAWING where a re-created pad can find it — this half is the bug', () => {
    const { store } = connectedStore();
    const png = draw(store, 'q-draw');

    // A brand-new pad asks the widget what to show for this question, and this is all it gets.
    // Today it gets a filename and a status and no image, so it renders an empty box over a
    // stored answer.
    expect(store.viewFor('q-draw').file).toBe(png);
  });

  it('shows a file upload as already uploaded — the contrast that isolates the defect', () => {
    const { store } = connectedStore();

    const token = store.begin('q-id-scan', new File(['x'], 'licence.pdf'));
    store.succeed(token, 'file-scan');

    // A FileUpload renders its confirmation FROM the store, which outlives the section, so the
    // same navigation leaves it looking answered. Doodle renders from the canvas instead.
    expect(store.viewFor('q-id-scan')).toMatchObject({ status: 'done', fileName: 'licence.pdf' });
  });
});

describe('one pad, two doodle questions', () => {
  it('never offers one question the drawing made for another', () => {
    const { store } = connectedStore();
    draw(store, 'q-draw');

    // OneQuestion mode re-points a single pad instance at the next question without re-creating
    // it, so a pad that repaints only on construction keeps the previous question's ink on
    // screen — reading "Drawn." over an unanswered question. Whatever the pad is handed for
    // this question has to be this question's.
    expect(store.viewFor('q-redraw').file).toBeNull();
    expect(store.viewFor('q-redraw').status).toBe('idle');
  });

  it('keeps the two drawings apart when both are drawn on', () => {
    const { store } = connectedStore();
    const first = draw(store, 'q-draw', 'first');
    const second = draw(store, 'q-redraw', 'second');

    expect(store.viewFor('q-draw').file).toBe(first);
    expect(store.viewFor('q-redraw').file).toBe(second);
  });
});

describe('the drawing tracks the answer through every outcome', () => {
  it('is still there after a failed upload, so a retry shows what they drew', () => {
    const { store, runtime } = connectedStore();
    const png = drawing();

    const token = store.begin('q-draw', png);
    store.fail(token, 'The upload did not go through. Please try again.');

    expect(runtime.valueFor('q-draw')).toBeUndefined();
    expect(store.viewFor('q-draw').file).toBe(png);
  });

  it('is gone once the respondent clears the pad', () => {
    const { store, runtime } = connectedStore();
    draw(store, 'q-draw');

    store.clear('q-draw');

    expect(runtime.valueFor('q-draw')).toBeUndefined();
    expect(store.viewFor('q-draw').file).toBeNull();
  });

  it('is gone for a question that was never drawn on', () => {
    const { store } = connectedStore();

    expect(store.viewFor('q-draw').file).toBeNull();
  });
});
