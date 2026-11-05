/**
 * Why a builder delete cannot happen, in a sentence the author can act on.
 *
 * A question respondents have answered cannot be deleted: every stored answer points at its
 * question (`FK_FormResponseAnswer_Question`), so the database refuses. With deletes held for Undo
 * (UI audit F07) that refusal used to arrive ten seconds late, after a toast that promised the
 * delete, as the raw SQL batch MJ reports — and the question then reappeared. So the builder asks
 * first ({@link answeredRefusal}) and refuses at the click, and any refusal that still comes back
 * from a save is reworded ({@link describeSaveError}) with the SQL left in the log only.
 */

export interface DeleteSubject {
  kind: 'question' | 'section';
  /** As the author sees it: the prompt, or "Section 2". */
  name: string;
}

/** The refusal for a delete whose question(s) hold `answers` stored answers, or null when there are none. */
export function answeredRefusal(subject: DeleteSubject, answers: number): string | null {
  if (answers <= 0) {
    return null;
  }
  const count = `${answers.toLocaleString()} ${answers === 1 ? 'answer' : 'answers'}`;
  return subject.kind === 'question'
    ? `“${subject.name}” can’t be deleted: respondents have given it ${count}, and those answers stay linked to it.`
    : `${subject.name} can’t be deleted: respondents have given its questions ${count}, and those answers stay linked to them.`;
}

/**
 * A save error as the author should read it. MJ reports a failed delete as the whole SQL batch it
 * ran; none of that helps the author, and the log keeps it in full.
 */
export function describeSaveError(error: string): string {
  if (/REFERENCE constraint "FK_FormResponseAnswer_Question"/.test(error)) {
    return 'Respondents have already answered it, and their answers stay linked to it.';
  }
  if (/conflicted with the REFERENCE constraint/.test(error)) {
    return 'Other records still point at it.';
  }
  if (!/Error executing SQL|\bQuery:/.test(error)) {
    return error;
  }
  // The database's own sentence: after the last "Error:", before the echoed query.
  const sentence = error.split(/\bQuery:/)[0].split(/Error:\s*/).pop()?.trim();
  return sentence || 'The database refused it.';
}
