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
import { computed, signal } from '@angular/core';

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

export class FormUploadStore {
  private readonly records = signal<ReadonlyMap<string, UploadRecord>>(new Map());

  /** Bumped per upload so a superseded one can be recognised even across questions. */
  private nextSeq = 0;

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
    return { questionId, seq };
  }

  /**
   * Record a successful upload. Returns false when the token has been superseded, which is the
   * caller's signal that it must not write the answer either.
   */
  public succeed(token: UploadToken): boolean {
    const current = this.records().get(token.questionId);
    if (!current || current.seq !== token.seq) {
      return false;
    }
    this.write(token.questionId, { ...current, status: 'done', progress: 1, error: null });
    return true;
  }

  /**
   * Record a failed upload. Returns false when the token has been superseded — the caller must
   * then leave the answer alone, because a newer upload may already have stored one.
   */
  public fail(token: UploadToken, message: string): boolean {
    const current = this.records().get(token.questionId);
    if (!current || current.seq !== token.seq) {
      return false;
    }
    this.write(token.questionId, { ...current, status: 'error', progress: null, error: message });
    return true;
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

  private write(questionId: string, record: UploadRecord): void {
    const next = new Map(this.records());
    next.set(questionId, record);
    this.records.set(next);
  }
}
