/**
 * What one address/contact field's `aria-describedby` names.
 *
 * Final review #4: on a group-level failure (a required address left empty) every field was marked
 * `aria-invalid`, but no field's description pointed at the visible "This question is required."
 * message, so a screen reader heard "invalid" with no reason.
 */
import { describe, expect, it } from 'vitest';
import { compositeFieldDescribedBy } from './composite-described-by';

const none = { helpId: null, fieldErrorId: null, groupErrorId: null, hasPartErrors: false };

describe('compositeFieldDescribedBy', () => {
  it('names nothing when there is no help and no error', () => {
    expect(compositeFieldDescribedBy(none)).toBeNull();
  });

  it('names the question help on a valid field', () => {
    expect(compositeFieldDescribedBy({ ...none, helpId: 'q-help' })).toBe('q-help');
  });

  it("names the field's own error after the help", () => {
    expect(compositeFieldDescribedBy({ ...none, helpId: 'q-help', fieldErrorId: 'q-city-error', hasPartErrors: true })).toBe(
      'q-help q-city-error',
    );
  });

  it('names the question error on a group-level failure, where no field has its own', () => {
    expect(compositeFieldDescribedBy({ ...none, helpId: 'q-help', groupErrorId: 'q-error' })).toBe('q-help q-error');
  });

  it('does not name the question error on a field that is fine while another field is wrong', () => {
    expect(compositeFieldDescribedBy({ ...none, groupErrorId: 'q-error', hasPartErrors: true })).toBeNull();
  });
});
