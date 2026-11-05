export interface CompositeFieldDescription {
  /** The question's help text id, when it has help. */
  helpId: string | null;
  /** This field's own error id, when this field has an error. */
  fieldErrorId: string | null;
  /** The question-level error id, when the question shows one. */
  groupErrorId: string | null;
  /** Whether ANY field has its own error (then the question-level message is not shown). */
  hasPartErrors: boolean;
}

/**
 * One address/contact field's description: the question's help, then why the field is invalid —
 * its own error, or, on a group-level failure where no field has one, the question's. Every field is
 * marked invalid in that case (`compositeInvalid`), so each must also say why.
 */
export function compositeFieldDescribedBy(s: CompositeFieldDescription): string | null {
  const ids: string[] = [];
  if (s.helpId) ids.push(s.helpId);
  if (s.fieldErrorId) {
    ids.push(s.fieldErrorId);
  } else if (!s.hasPartErrors && s.groupErrorId) {
    ids.push(s.groupErrorId);
  }
  return ids.length > 0 ? ids.join(' ') : null;
}
