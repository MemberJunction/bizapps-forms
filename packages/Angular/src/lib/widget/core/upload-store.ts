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
 */
import { signal } from '@angular/core';

import { type AnswerValue } from '@mj-biz-apps/forms-entities';

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

/** What a file question renders for its current upload. */
export interface UploadView {
  readonly status: UploadStatus;
  /** Display name of the file backing the answer; '' when there is none. */
  readonly fileName: string;
  /** 0–1 while uploading, or null for an indeterminate phase. */
  readonly progress: number | null;
  /** Respondent-facing failure text, or null. */
  readonly error: string | null;
}

/** What every question shows before anything has been uploaded for it. */
export const IDLE_UPLOAD: UploadView = { status: 'idle', fileName: '', progress: null, error: null };

/**
 * Permission to write the result of one upload.
 *
 * Uploads are not serialized — the signature pad can start a second while the first is still
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
  /** Retained so the respondent can retry a failed upload. */
  readonly file: File | null;
}

const idleRecord = (seq: number, file: File | null): UploadRecord => ({ ...IDLE_UPLOAD, seq, file });

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

  private sink: UploadAnswerSink | null = null;

  /** Bumped per upload so a superseded one can be recognised even across questions. */
  private nextSeq = 0;

  /**
   * Bind this store to the runtime whose answers its uploads become.
   *
   * Called when the form definition loads, because the runtime does not exist before then. Any
   * records held now describe the PREVIOUS runtime's form, so they go with it — a reload mints a
   * new response id, and a confirmation carried across would name a file that response never had.
   */
  public connect(sink: UploadAnswerSink): void {
    this.sink = sink;
    this.records.set(new Map());
  }

  /** Begin uploading `file` for `questionId`; the returned token is what may write the result. */
  public begin(questionId: string, file: File): UploadToken {
    const seq = ++this.nextSeq;
    this.write(questionId, {
      status: 'uploading',
      fileName: file.name,
      progress: 0,
      error: null,
      seq,
      file,
    });
    // No answer while an upload is in flight: a required FileUpload must not be satisfied by a
    // file that is not stored yet, and a replacement must not leave the old id standing.
    this.commit(questionId, null);
    return { questionId, seq };
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
    this.write(token.questionId, { ...current, status: 'done', progress: 1, error: null });
    this.commit(token.questionId, fileId);
  }

  /**
   * Record a failed upload and leave the question unanswered.
   *
   * A superseded token is ignored, and it matters more here than on the success path: clearing
   * the answer on a stale failure wipes the one a NEWER upload had already stored successfully.
   */
  public fail(token: UploadToken, message: string): void {
    const current = this.records().get(token.questionId);
    if (!current || current.seq !== token.seq) {
      return;
    }
    this.write(token.questionId, { ...current, status: 'error', progress: null, error: message });
    this.commit(token.questionId, null);
  }

  /** The file last chosen for `questionId`, so a failed upload can be retried. */
  public lastFileFor(questionId: string): File | null {
    return this.records().get(questionId)?.file ?? null;
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
   * Projected rather than returned whole: the record also carries the supersede stamp and the
   * retained File, which are this store's business and not the template's.
   */
  public viewFor(questionId: string): UploadView {
    const record = this.records().get(questionId);
    if (!record) {
      return IDLE_UPLOAD;
    }
    const { status, fileName, progress, error } = record;
    return { status, fileName, progress, error };
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

  private write(questionId: string, record: UploadRecord): void {
    const next = new Map(this.records());
    next.set(questionId, record);
    this.records.set(next);
  }
}
