/**
 * Upload lifecycle state for a form's file questions, keyed by question id.
 *
 * This state used to live in `FormQuestionComponent` as six private fields. That worked only
 * while a question component stayed mounted for the life of the form, and neither render mode
 * does: OneQuestion renders every question through ONE reused instance, and Scroll's `@for`
 * recycles instances by position across sections. So the private fields outlived the question
 * they described, and a resume uploaded on section two was announced as already-uploaded against
 * whatever question landed at the same index on section one.
 *
 * Keying on the question id removes that whole class of mistake rather than guarding against it:
 * a component asking for its own question cannot be handed another question's answer, however
 * the framework chooses to reuse it. It also means the confirmation survives navigation, which a
 * per-instance field cannot do once the instance is destroyed.
 *
 * One store per widget instance — NOT a `BaseSingleton`. Several forms can be embedded on one
 * host page, and they must not see each other's uploads.
 *
 * It also owns an upload's whole life, not just its outcome (#248). A submit that started while a
 * drawing was on the wire used to send the response without it, because nothing on the submit
 * path could see the upload, let alone wait for it. So the store runs the transport call it is
 * handed ({@link FormUploadStore.upload}), retries a bad moment by itself, keeps the call so it
 * can restart it, and answers {@link FormUploadStore.whenSettled} for whoever must not judge the
 * answers until the uploads have landed.
 */
import { computed, signal, type Signal } from '@angular/core';

import { type AnswerValue } from '@mj-biz-apps/forms-entities/contracts';

import { UploadError, type UploadedFile, type UploadProgress } from '../api/form-upload.interface';
import { failureDetail } from './failure-detail';

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

/**
 * How long to wait before each retry of a transient upload failure; the length is the cap
 * (three retries, four attempts in all).
 *
 * The same schedule as the autosave's private `RETRY_DELAYS_MS`, duplicated on purpose: the two
 * describe the same judgement about how long a bad moment lasts, but the autosave must not change
 * in #248, and exporting its constant from here (or this one from there) would couple two
 * controllers that otherwise know nothing of each other. If one schedule is tuned, tune both.
 */
export const UPLOAD_RETRY_DELAYS_MS = [5_000, 15_000, 60_000] as const;

/** What a respondent reads once every retry of an upload has failed. */
export const UPLOAD_UNSAVED_MESSAGE = 'Your file did not save. Check your connection and try again.';

/**
 * Why a question's upload ended without a stored file.
 *
 * `refused`: the server (or the configuration) rejected the file itself — only a different file
 * can help. `unsaved`: every retry hit a bad moment — the same file may well land if tried again.
 */
export type UploadFailure = { readonly kind: 'refused' | 'unsaved'; readonly message: string };

/**
 * One transport call for one file, with the question and response already bound in.
 *
 * The store is handed the CALL rather than the transport so it can make the call again — on a
 * retry, or on a restart after the retries were spent — without knowing the slug, the response
 * id, or which transport is bound.
 */
export type UploadSend = (onProgress: UploadProgress) => Promise<UploadedFile>;

/** What a file question renders for its current upload. */
export interface UploadView {
  readonly status: UploadStatus;
  /** Display name of the file backing the answer; '' when there is none. */
  readonly fileName: string;
  /** 0–1 while uploading, or null for an indeterminate phase. */
  readonly progress: number | null;
  /** Why the upload ended without a stored file, or null. Set only while `status` is `'error'`. */
  readonly failure: UploadFailure | null;
  /**
   * The file itself, for a control that has to RENDER it rather than name it.
   *
   * The doodle pad is that control, and this field is what puts the drawing back after the
   * respondent leaves the section and returns. Its canvas dies with the component, so a pad
   * with nothing to repaint from shows an empty box over an answer that is stored — which is
   * exactly what the respondent reads as "my drawing is gone". Every other control in the
   * widget renders from the answer it is given; this is what lets the pad do the same.
   *
   * It doubles as the file a failed upload is retried with. One field, because it is one fact:
   * the artifact this question's answer is made of, for as long as the answer stands.
   */
  readonly file: File | null;
}

/** What every question shows before anything has been uploaded for it. */
export const IDLE_UPLOAD: UploadView = {
  status: 'idle',
  fileName: '',
  progress: null,
  failure: null,
  file: null,
};

/**
 * Permission to write the result of one upload.
 *
 * Uploads are not serialized — the doodle pad can start a second while the first is still
 * going, and a respondent can pick a different file mid-upload — so without a stamp the answer
 * becomes whichever response ARRIVES last rather than whichever was asked for last. On a lossy
 * mobile link those differ routinely.
 */
export interface UploadToken {
  readonly questionId: string;
  readonly seq: number;
}

interface UploadRecord extends UploadView {
  /** The newest upload started for this question; only it may write. */
  readonly seq: number;
  /**
   * The transport call that produced this record, kept so {@link FormUploadStore.restart} can
   * make it again. Null for an upload begun without one (`begin` directly) and for a cleared
   * question. Not part of the view: a template has no business calling the transport.
   */
  readonly send: UploadSend | null;
}

const idleRecord = (seq: number, file: File | null): UploadRecord => ({ ...IDLE_UPLOAD, seq, file, send: null });

/** A pending {@link FormUploadStore.whenSettled} call. */
interface SettleWaiter {
  /** The questions it waits on; null means every question. */
  readonly questionIds: readonly string[] | null;
  readonly resolve: () => void;
}

/** A promise that resolves after `ms`. `setTimeout` so fake timers drive it in tests. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Where a file question's answer is written.
 *
 * `FormRuntime` satisfies this structurally; the store asks for the narrowest thing it needs so
 * it cannot reach into the rest of the runtime.
 */
export interface UploadAnswerSink {
  setValue(questionId: string, value: AnswerValue): void;
}

export class FormUploadStore {
  private readonly records = signal<ReadonlyMap<string, UploadRecord>>(new Map());

  private readonly waiters = signal<readonly SettleWaiter[]>([]);

  /**
   * True while any {@link whenSettled} call is still pending — the submit overlay reads it to say
   * "Saving your file…" instead of leaving the respondent looking at a button that did nothing.
   */
  public readonly waiting: Signal<boolean> = computed(() => this.waiters().length > 0);

  private sink: UploadAnswerSink | null = null;

  /** Bumped per upload so a superseded one can be recognised even across questions. */
  private nextSeq = 0;

  /**
   * Bind this store to the runtime whose answers its uploads become.
   *
   * Called when the form definition loads, because the runtime does not exist before then. Any
   * records held now describe the PREVIOUS runtime's form, so they go with it — a reload mints a
   * new response id, and a confirmation carried across would name a file that response never had.
   *
   * Dropping the records also retires every upload still running for the old form: a retry asleep
   * between attempts wakes, finds its record gone, and stops. Anyone waiting on those uploads is
   * released here, because no record is left that could release them later.
   */
  public connect(sink: UploadAnswerSink): void {
    this.sink = sink;
    this.dropRecords();
  }

  /**
   * Retire every upload and drop the answer sink, for a widget being torn down.
   *
   * The same retirement as {@link connect}: a retry asleep between attempts wakes, finds its record
   * gone, and stops without calling the transport again; an attempt still on the wire lands on a
   * superseded token and writes nothing; and every waiter is released. Without it a destroyed
   * widget kept retrying for up to the whole schedule, and wrote its results into a runtime nobody
   * renders. Dropping the sink makes a write that somehow got past the token check throw rather
   * than land.
   */
  public dispose(): void {
    this.sink = null;
    this.dropRecords();
  }

  /** Begin uploading `file` for `questionId`; the returned token is what may write the result. */
  public begin(questionId: string, file: File): UploadToken {
    return this.start(questionId, file, null);
  }

  /**
   * Upload `file` for `questionId` through `send`, retrying a bad moment, and store the result.
   *
   * A failure the transport calls `refused` (an {@link UploadError} of that kind) ends the upload
   * at once: the same bytes get the same verdict, so retrying only delays the respondent learning
   * they need a different file. Anything else — a transient `UploadError`, or a plain `Error` from
   * a transport that does not classify — is retried on {@link UPLOAD_RETRY_DELAYS_MS}, because
   * guessing "refused" would give up on an answer a retry could have saved. Between attempts the
   * record stays `uploading` with indeterminate progress, so a submit waiting on it keeps waiting
   * rather than judging a question that is still being worked on. Once the schedule is spent the
   * upload fails as `unsaved`, which a respondent can restart.
   *
   * The currency check before every attempt is what lets a newer upload, a clear, or a reload stop
   * a retry that is asleep: none of them can cancel a timer they cannot see, but each replaces the
   * record the sleeper's token points at. A superseded upload stops silently — whatever replaced
   * it owns the question now.
   *
   * Every transport outcome is written to the record, which is where the widget reads it, so a
   * failed upload does not reject. The one thing that does is a throw from the answer sink while
   * storing a successful result: that is a wiring bug, and it propagates rather than being retried.
   */
  public async upload(questionId: string, file: File, send: UploadSend): Promise<void> {
    const token = this.start(questionId, file, send);
    // One more attempt than there are delays: the first try, then one retry per delay.
    const maxAttempts = UPLOAD_RETRY_DELAYS_MS.length + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!this.isCurrent(token)) {
        return;
      }
      let stored: UploadedFile;
      try {
        stored = await send((fraction) => this.setProgress(token, fraction));
      } catch (err) {
        if (err instanceof UploadError && err.kind === 'refused') {
          this.fail(token, { kind: 'refused', message: err.message });
          return;
        }
        // The respondent sees nothing until the schedule is spent, so this line is the only
        // trace of a flaky connection — and the only place a non-UploadError bug would show.
        console.warn(
          `[mj-forms] upload for question ${questionId} failed on attempt ${attempt} of ${maxAttempts}: ` +
            failureDetail(err),
          err,
        );
        if (attempt === maxAttempts) {
          break;
        }
        this.setProgress(token, null);
        await sleep(UPLOAD_RETRY_DELAYS_MS[attempt - 1]);
        continue;
      }
      // Outside the try on purpose: a throw from storing the answer is the widget wired wrong, not
      // a bad moment on the wire. Retrying it would re-send bytes the server already stored and
      // hide the bug, so it propagates to the caller instead.
      this.succeed(token, stored.fileId);
      return;
    }
    // The cap is spent. `fail` ignores a superseded token, so this cannot overwrite a newer upload.
    this.fail(token, { kind: 'unsaved', message: UPLOAD_UNSAVED_MESSAGE });
  }

  /**
   * Run `questionId`'s upload again with the same file and transport call.
   *
   * A no-op when there is nothing to restart: no record, no file, or a record begun without a
   * transport call (`begin` directly), which this store cannot make again on its own.
   *
   * Restarting a question whose upload is still running supersedes the running series: the new
   * attempt takes a fresh token, and the old series stops at its next currency check (its late
   * result, if any, is ignored by `succeed`/`fail`).
   */
  public restart(questionId: string): Promise<void> {
    const record = this.records().get(questionId);
    if (!record?.file || !record.send) {
      return Promise.resolve();
    }
    return this.upload(questionId, record.file, record.send);
  }

  /**
   * Restart every listed question whose upload ended `unsaved`.
   *
   * A `refused` one is left alone on purpose: restarting it would send the same rejected bytes and
   * show the same verdict, after a wait. Fire-and-forget — the caller learns the outcome through
   * {@link whenSettled} and {@link failureAmong}. `upload` rejects only on an answer-sink throw
   * (a wiring bug); left unawaited here, that surfaces as an unhandled rejection, not silence.
   */
  public retryUnsaved(questionIds: readonly string[]): void {
    for (const questionId of questionIds) {
      if (this.records().get(questionId)?.failure?.kind === 'unsaved') {
        void this.restart(questionId);
      }
    }
  }

  /**
   * Resolves once none of `questionIds` (default: every question) is `uploading`; at once if none
   * is now.
   *
   * "Settled" is not "succeeded": the caller reads {@link failureAmong} afterwards to tell the two
   * apart. A retry asleep between attempts is still `uploading`, so a waiter sits through the
   * whole schedule; a newer upload for the same question keeps it waiting, for the newer one. It
   * never rejects and never hangs past the upload it waits on, because every path that ends an
   * upload — success, failure, clear, reload, teardown — goes through `write()` or `dropRecords()`, and both
   * re-check the waiters.
   */
  public whenSettled(questionIds?: readonly string[]): Promise<void> {
    const ids = questionIds ?? null;
    if (this.isSettled(ids)) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.update((waiters) => [...waiters, { questionIds: ids, resolve }]);
    });
  }

  /** The first failure among `questionIds`, in the order given, or null. A pure read. */
  public failureAmong(questionIds: readonly string[]): UploadFailure | null {
    const records = this.records();
    for (const questionId of questionIds) {
      const failure = records.get(questionId)?.failure;
      if (failure) {
        return failure;
      }
    }
    return null;
  }

  /**
   * Record a successful upload AND store its file as the question's answer.
   *
   * The two are one act, which is the point. They used to be two: the store recorded the
   * confirmation against the question id, and the component emitted the file id through its
   * `valueChange` output. An output is routed by the VIEW — `(valueChange)="onValueChange(q, ...)"`
   * reads whichever question the template is bound to when the event fires — and by the time a
   * slow upload resolved that was a different question in OneQuestion mode (one component
   * instance serves the whole deck, so the resume's file id was written as the next question's
   * answer) or no question at all in Scroll (leaving the page destroys the component, and an
   * emit from a destroyed `output()` is dropped, so the answer was silently lost while this
   * store still showed "done"). Committing here removes the view from the path entirely.
   *
   * A superseded token writes NOTHING: its bytes are stored and its `MJ: Files` row exists, but
   * the respondent has since asked for a different file — or for none — and that is the answer
   * that has to stand.
   */
  public succeed(token: UploadToken, fileId: string): void {
    const current = this.records().get(token.questionId);
    if (!current || current.seq !== token.seq) {
      return;
    }
    this.write(token.questionId, { ...current, status: 'done', progress: 1, failure: null });
    this.commit(token.questionId, fileId);
  }

  /**
   * Record a failed upload and leave the question unanswered.
   *
   * A superseded token is ignored, and it matters more here than on the success path: clearing
   * the answer on a stale failure wipes the one a NEWER upload had already stored successfully.
   */
  public fail(token: UploadToken, failure: UploadFailure): void {
    const current = this.records().get(token.questionId);
    if (!current || current.seq !== token.seq) {
      return;
    }
    this.write(token.questionId, { ...current, status: 'error', progress: null, failure });
    this.commit(token.questionId, null);
  }

  /**
   * Report progress for a running upload; a superseded token is ignored.
   *
   * `null` is a phase, not an absence: the transport reports it when it cannot say how far along
   * the upload is (no Content-Length), and the bar renders indeterminate for it.
   */
  public setProgress(token: UploadToken, fraction: number | null): void {
    const current = this.records().get(token.questionId);
    if (!current || current.seq !== token.seq) {
      return;
    }
    this.write(token.questionId, { ...current, progress: fraction });
  }

  /**
   * Forget `questionId`'s upload and retire anything in flight for it.
   *
   * Retiring matters as much as forgetting: the respondent has said they do not want this file,
   * and an upload already on the wire will still resolve.
   */
  public clear(questionId: string): void {
    this.write(questionId, idleRecord(++this.nextSeq, null));
    this.commit(questionId, null);
  }

  /**
   * What `questionId` should render right now.
   *
   * Projected rather than returned whole: the record also carries the supersede stamp, which is
   * this store's business and not the template's. The file is NOT stripped — see
   * {@link UploadView.file}; a control that draws its answer needs the answer.
   */
  public viewFor(questionId: string): UploadView {
    const record = this.records().get(questionId);
    if (!record) {
      return IDLE_UPLOAD;
    }
    const { status, fileName, progress, failure, file } = record;
    return { status, fileName, progress, failure, file };
  }

  /** Start a new upload record for `questionId`, superseding any earlier one. */
  private start(questionId: string, file: File, send: UploadSend | null): UploadToken {
    const seq = ++this.nextSeq;
    this.write(questionId, {
      status: 'uploading',
      fileName: file.name,
      progress: 0,
      failure: null,
      seq,
      file,
      send,
    });
    // No answer while an upload is in flight: a required FileUpload must not be satisfied by a
    // file that is not stored yet, and a replacement must not leave the old id standing.
    this.commit(questionId, null);
    return { questionId, seq };
  }

  /** Is `token` still the newest upload for its question? False once replaced, cleared or reloaded. */
  private isCurrent(token: UploadToken): boolean {
    return this.records().get(token.questionId)?.seq === token.seq;
  }

  /** Is none of `questionIds` (null: every question) uploading? */
  private isSettled(questionIds: readonly string[] | null): boolean {
    const records = this.records();
    const ids = questionIds ?? [...records.keys()];
    return ids.every((questionId) => records.get(questionId)?.status !== 'uploading');
  }

  /**
   * Forget every record — retiring every token, since each currency check now misses — and
   * release the waiters, which no remaining record could release later.
   */
  private dropRecords(): void {
    this.records.set(new Map());
    this.releaseSettledWaiters();
  }

  /** Resolve and drop every waiter whose questions are no longer uploading. */
  private releaseSettledWaiters(): void {
    const waiters = this.waiters();
    if (waiters.length === 0) {
      return;
    }
    const settled = waiters.filter((waiter) => this.isSettled(waiter.questionIds));
    if (settled.length === 0) {
      return;
    }
    this.waiters.set(waiters.filter((waiter) => !settled.includes(waiter)));
    for (const waiter of settled) {
      waiter.resolve();
    }
  }

  /**
   * Write a file question's answer.
   *
   * Throws rather than dropping the answer: an unconnected store means the widget wired itself
   * wrong, and a respondent silently submitting a form without the file they attached is the
   * worse of the two outcomes by a distance.
   */
  private commit(questionId: string, value: AnswerValue): void {
    if (!this.sink) {
      throw new Error(
        `FormUploadStore has no answer sink, so the upload for question ${questionId} cannot be stored. ` +
          'Call connect(runtime) when the form definition loads.',
      );
    }
    this.sink.setValue(questionId, value);
  }

  /**
   * The only writer of a question's record, which is why the waiters are re-checked here: any
   * change that can end an upload passes through this line, so no `whenSettled` can be left
   * pending by a path that forgot to release it. (`dropRecords` replaces the whole map and re-checks
   * on its own.)
   */
  private write(questionId: string, record: UploadRecord): void {
    const next = new Map(this.records());
    next.set(questionId, record);
    this.records.set(next);
    this.releaseSettledWaiters();
  }
}
