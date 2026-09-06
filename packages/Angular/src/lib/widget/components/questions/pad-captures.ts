/**
 * Which of the doodle pad's outstanding async jobs still speak for it.
 *
 * The pad has two operations that finish LATER than the gesture that started them: exporting the
 * drawing (`toBlob`) and repainting a stored one (`createImageBitmap`). In between, the
 * respondent can clear the pad, start another stroke, or step to the next question — and a
 * result that lands afterwards is answering a question nobody is asking any more.
 */
export class PadCaptures {
  private generation = 0;

  /** A claim on the pad as it stands right now, for the subject it is standing for. */
  public claim(subject: string): CaptureClaim {
    return { subject, generation: this.generation };
  }

  /**
   * Retire every outstanding claim: what the pad means has changed.
   *
   * Called for the three gestures that change it — Clear, Undo, and the start of a new stroke.
   * Undo joined that list with the stroke model (#98): taking a stroke back changes what the pad
   * means exactly as adding one does, so a repaint or an export still in flight is describing a
   * drawing that no longer exists.
   */
  public supersede(): void {
    this.generation++;
  }

  /**
   * Whether a claim may still WRITE the canvas — a repaint landing after its decode.
   *
   * Stricter than {@link mayEmit} by exactly one condition, and the difference is the point: a
   * repaint acts on the pad the respondent is looking at, so it needs that pad to still be the
   * one it was started for. An export acts on nothing; it carries its subject away with it.
   */
  public mayPaint(claim: CaptureClaim, subject: string): boolean {
    return this.mayEmit(claim) && claim.subject === subject;
  }

  /** Whether a claim's captured output may still be emitted. */
  public mayEmit(claim: CaptureClaim): boolean {
    return claim.generation === this.generation;
  }
}

/** Permission to finish one async job on the pad. */
export interface CaptureClaim {
  readonly subject: string;
  readonly generation: number;
}
