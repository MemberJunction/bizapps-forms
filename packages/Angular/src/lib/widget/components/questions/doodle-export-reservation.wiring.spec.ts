/**
 * Structural guards for #333: a drawing still being exported must hold Next and Submit.
 *
 * The pad exports its PNG after the pointer lifts and only then hands the file over for upload.
 * Next and Submit wait on the upload store, and during the export the store had no record, so
 * Scroll advanced, destroyed the section, and the finished export landed on a destroyed `output()`
 * that Angular dropped (NG0953). The drawing was lost while the pad said "Drawn.".
 *
 * The fix makes the export visible to the store the moment it starts (a reservation), and routes
 * the export's outcome through functions the parent hands in, which outlive the component. The
 * store's half is unit-tested in `core/export-reservation.spec.ts` and `core/upload-store.spec.ts`.
 * These classes use `inject()` and cannot be instantiated in this suite's node environment, so
 * what is checkable for the wiring is the source, as in `doodle-upload-race.wiring.spec.ts`.
 *
 * Comments are stripped before every assertion: the source explains these same decisions, and a
 * guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const question = (): string => stripped('form-question.component.ts');
const pad = (): string => stripped('doodle-pad.component.ts');

/** The balanced `{ ... }` block that follows the first occurrence of `marker` in `source`. */
function blockAfter(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at < 0) {
    throw new Error(`"${marker}" not found`);
  }
  const open = source.indexOf('{', at + marker.length);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(open, i + 1);
      }
    }
  }
  throw new Error(`unbalanced block after "${marker}"`);
}

const emitPng = (): string => blockAfter(pad(), 'private async emitPng(): Promise<void>');
const onPointerUp = (): string => blockAfter(pad(), 'protected onPointerUp(event: PointerEvent): void');

describe('the export is reported to the parent the moment it starts', () => {
  it('reports the start before the export awaits anything', () => {
    // Everything before the first `await` in an async method runs synchronously in the caller's
    // turn, so reporting here is reporting at pointer-up: there is no tick in which a Next tap
    // can find the store without a record for this drawing.
    const body = emitPng();
    const firstAwait = body.indexOf('await ');
    const started = body.indexOf('.started(claim.subject)');
    expect(started).toBeGreaterThan(-1);
    expect(firstAwait).toBeGreaterThan(started);
  });

  it('runs the export straight from pointer-up, with no await before it', () => {
    const body = onPointerUp();
    expect(body).toMatch(/void this\.emitPng\(\);/);
    expect(body.slice(0, body.indexOf('this.emitPng('))).not.toMatch(/await /);
  });
});

describe('the export reaches the parent through functions, not an output()', () => {
  it('declares no drawn output', () => {
    // An `output()` emit after the component is destroyed is dropped with NG0953. A function the
    // parent handed in is still callable then.
    expect(pad()).not.toMatch(/drawn = output</);
  });

  it('takes the export callbacks as one required input', () => {
    expect(pad()).toMatch(/exportSink = input\.required<DoodleExportSink<unknown>>\(\)/);
    const template = stripped('form-question.component.html');
    expect(template).toMatch(/<mjf-doodle-pad[\s\S]{0,300}\[exportSink\]="doodleExports"/);
    expect(template).not.toMatch(/\(drawn\)=/);
  });
});

describe('every export ends in exactly one of delivered or released', () => {
  it('releases in a finally block unless the file was delivered', () => {
    // An orphaned reservation stays `uploading`, and Next and Submit wait on it for ever.
    expect(emitPng()).toMatch(/finally \{\s*if \(!delivered\) \{\s*sink\.released\(reservation\);\s*\}\s*\}/);
  });

  it('puts both no-file exits, and the delivery, inside that try', () => {
    const body = emitPng();
    const tryAt = body.indexOf('try {');
    const finallyAt = body.indexOf('finally {');
    const nullBlob = body.indexOf('if (!blob)');
    const superseded = body.indexOf('if (!this.captures.mayEmit(claim))');
    const delivery = body.indexOf('sink.delivered({');
    for (const at of [nullBlob, superseded, delivery]) {
      expect(at).toBeGreaterThan(tryAt);
      expect(at).toBeLessThan(finallyAt);
    }
    expect(tryAt).toBeGreaterThan(-1);
    // The flag is set only after the hand-over returns, so a throw from it still releases.
    expect(body).toMatch(/sink\.delivered\(\{[\s\S]{0,200}\},\s*reservation\);\s*delivered = true;/);
  });
});

describe('the question component wires the callbacks to the store, by the subject the pad passed', () => {
  // The sink's logic lives in `doodle-export-sink.ts`, a plain function this suite can RUN —
  // `doodle-export-sink.spec.ts` drives its delivery guard against a real store. What is left to
  // check here is the binding: the component hands that function the store and an upload keyed by
  // the capture's own subject.
  const binding = (): string => blockAfter(question(), 'protected readonly doodleExports');
  const sinkModule = (): string => stripped('doodle-export-sink.ts');

  it('binds the pad to doodleExportSink over the widget store, uploading by the capture subject', () => {
    expect(question()).toMatch(
      /protected readonly doodleExports: DoodleExportSink<UploadToken> = doodleExportSink\(\s*this\.uploads,\s*async \(capture\) => \{/,
    );
    expect(binding()).toMatch(/^\{\s*await this\.uploadFile\(capture\.file, capture\.subject\);\s*\}$/);
  });

  it('reserves on start, uploads on delivery, and releases on release', () => {
    expect(sinkModule()).toMatch(/started: \(subject\) => uploads\.reserve\(subject\)/);
    expect(sinkModule()).toMatch(/released: \(reservation\) => uploads\.release\(reservation\)/);
  });

  it('uploads a delivery only while its reservation is still current', () => {
    // A store `dispose()` (teardown) or `connect()` (reload) inside the encode window retires the
    // reservation. Uploading anyway would throw "no answer sink" after a teardown, or file the old
    // drawing into the new runtime after a reload. The guard must RETURN before the upload: a
    // check whose body does nothing reads the same to a weaker assertion.
    expect(pad()).toMatch(/sink\.delivered\(\{[\s\S]{0,200}\},\s*reservation\);/);
    expect(sinkModule()).toMatch(
      /delivered: async \(capture, reservation\) => \{\s*if \(!uploads\.isCurrent\(reservation\)\) \{\s*return;\s*\}\s*await upload\(capture\);\s*\}/,
    );
  });

  it('never reads the question the view is bound to now', () => {
    // The callbacks run after an await, when a recycled or re-pointed component may be rendering
    // another question. The sink module has no access to one at all.
    expect(binding()).not.toMatch(/this\.question\(\)/);
    expect(sinkModule()).not.toMatch(/question\(\)/);
  });
});
