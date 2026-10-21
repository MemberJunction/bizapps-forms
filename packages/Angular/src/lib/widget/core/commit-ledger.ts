/**
 * What the respondent has COMMITTED (blur / advance) versus what the server has JUDGED, as payload
 * keys. The widget acts on a save's `ended` verdict only when the answers it carried are exactly the
 * committed ones; this ledger holds the three facts that decision reads. Pure state: no Angular, no
 * side effect — the component decides what to do with the answers.
 */

import type { FormsSaveResponseOutput } from '@mj-biz-apps/forms-entities';

export class CommitLedger {
  /**
   * The answers as they stood at the respondent's last COMMIT (blur / advance), as a payload key —
   * or `undefined` before the first commit, or while the draft is held.
   *
   * The server judges knockouts on every partial save, keystroke autosaves included, and a keystroke
   * save carries half-typed values (`1` on its way to `18`). So a save's `ended` is acted on only when
   * the answers it carried are exactly the committed ones: a verdict on finished answers. A keystroke
   * save that comes back `ended` is remembered (see {@link Acknowledge}) and acted on if the
   * respondent then commits those same answers.
   */
  private committedAnswers: string | undefined;
  /**
   * The last save the server ACCEPTED, with the payload key it carried — so a commit whose answers
   * the server already judged reuses that verdict rather than sending them again. Tabbing through a
   * scroll form commits on every blur; without this each one would be another request against the
   * respondent's autosave budget.
   */
  private lastAcknowledged: { readonly answersKey: string; readonly result: FormsSaveResponseOutput } | undefined;
  /**
   * The payload key of the answers the form OPENED with — empty on a first sitting, the stored draft
   * on a resume — which the server already holds (or has nothing of). Until a save is accepted, a save
   * of exactly these answers has nothing to send (fix round 1): a blur on an untouched field must
   * not write an empty Partial row, which counts against the per-version draft ceiling and makes the
   * page mint a device invite.
   */
  private loadedAnswers: string | undefined;

  /** Forget every commit and verdict; `loadedAnswers` is what the form opened with. */
  public Reset(loadedAnswers: string | undefined): void {
    this.committedAnswers = undefined;
    this.lastAcknowledged = undefined;
    this.loadedAnswers = loadedAnswers;
  }

  /** Record the answers committed now (`undefined` while the draft is held). */
  public Commit(key: string | undefined): void {
    this.committedAnswers = key;
  }

  /** Record a save the server accepted, with the payload key it carried. */
  public Acknowledge(answersKey: string, result: FormsSaveResponseOutput): void {
    this.lastAcknowledged = { answersKey, result };
  }

  /** The answers the server already has: the last accepted save's, or — before one — those the form opened with. */
  public JudgedAnswers(): string | undefined {
    return this.lastAcknowledged?.answersKey ?? this.loadedAnswers;
  }

  /** The accepted save's result, only when it carried exactly `key`. */
  public VerdictFor(key: string): FormsSaveResponseOutput | undefined {
    return this.lastAcknowledged?.answersKey === key ? this.lastAcknowledged.result : undefined;
  }

  /** True when a commit stands that no accepted save has judged. */
  public HasUnjudgedCommit(): boolean {
    return this.committedAnswers !== undefined && this.committedAnswers !== this.lastAcknowledged?.answersKey;
  }

  /** True when `key` is exactly the committed answers (never true while nothing is committed). */
  public IsCommitted(key: string): boolean {
    return this.committedAnswers === key;
  }
}
