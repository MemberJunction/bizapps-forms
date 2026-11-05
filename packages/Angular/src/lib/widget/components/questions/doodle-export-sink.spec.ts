/**
 * The doodle pad's export sink, run against a real `FormUploadStore` (#333).
 *
 * The sink is what turns the pad's three reports — an export started, delivered, released — into
 * store calls. Its one decision is the delivery guard: a drawing whose reservation was retired
 * while it encoded (the widget torn down, the form reloaded, the pad cleared) must not upload.
 * Uploading after a teardown throws "no answer sink"; after a reload it files the old drawing into
 * a response that no longer exists. This spec drives that guard for real; the wiring spec can only
 * read the source, and a guard that is present but does nothing reads the same as one that works.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';

import { FormRuntime } from '../../core/form-runtime';
import { FormUploadStore } from '../../core/upload-store';
import { fullForm } from '../../core/widget-form';
import { doodleExportSink } from './doodle-export-sink';
import type { DoodleCapture } from './doodle-pad.component';

/** Two Doodle questions, so "the wrong question" is a place a drawing could land. */
function doodleForm(): PublishedFormDefinition {
  const doodle = (id: string, order: number) => ({
    id,
    type: 'Doodle' as const,
    prompt: id,
    isRequired: false,
    displayOrder: order,
    options: [],
  });
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Drawings',
    renderMode: 'OneQuestion',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    pages: [{ id: 'p1', displayOrder: 1, questions: [doodle('q-one', 1), doodle('q-two', 2)] }],
    endScreens: [],
  };
}

function wired() {
  const store = new FormUploadStore();
  store.connect(new FormRuntime(fullForm(doodleForm())));
  const upload = vi.fn<(capture: DoodleCapture) => Promise<void>>(() => Promise.resolve());
  return { store, upload, sink: doodleExportSink(store, upload) };
}

const drawing = (): File => new File(['png'], 'doodle.png', { type: 'image/png' });

describe('doodleExportSink', () => {
  it('reserves the question the pad names when an export starts', () => {
    const { store, sink } = wired();
    sink.started('q-two');
    expect(store.viewFor('q-two').status).toBe('uploading');
    expect(store.viewFor('q-one').status).toBe('idle');
  });

  it('uploads a delivery against the subject the capture names while its reservation is current', async () => {
    const { upload, sink } = wired();
    const reservation = sink.started('q-two');
    const file = drawing();
    await sink.delivered({ subject: 'q-two', file }, reservation);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith({ subject: 'q-two', file });
  });

  it('drops a delivery whose reservation a teardown retired, without throwing', async () => {
    const { store, upload, sink } = wired();
    const reservation = sink.started('q-one');
    store.dispose();
    await expect(sink.delivered({ subject: 'q-one', file: drawing() }, reservation)).resolves.toBeUndefined();
    expect(upload).not.toHaveBeenCalled();
  });

  it('drops a delivery whose reservation a reload retired', async () => {
    const { store, upload, sink } = wired();
    const reservation = sink.started('q-one');
    store.connect(new FormRuntime(fullForm(doodleForm())));
    await sink.delivered({ subject: 'q-one', file: drawing() }, reservation);
    expect(upload).not.toHaveBeenCalled();
  });

  it('drops a delivery whose reservation a Clear retired', async () => {
    const { store, upload, sink } = wired();
    const reservation = sink.started('q-one');
    store.clear('q-one');
    await sink.delivered({ subject: 'q-one', file: drawing() }, reservation);
    expect(upload).not.toHaveBeenCalled();
  });

  it('releases with the reservation the pad hands back, so a superseded one changes nothing', () => {
    const { store, sink } = wired();
    const first = sink.started('q-one');
    const second = sink.started('q-one');
    sink.released(first);
    expect(store.viewFor('q-one').status).toBe('uploading');
    sink.released(second);
    expect(store.viewFor('q-one').status).toBe('idle');
  });
});
