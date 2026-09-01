/**
 * What an in-place title edit commits, and what it puts back.
 *
 * THE DEFECT this exists for, reproduced against the running builder on 2026-08-31: the form-name
 * box was a bare input whose only path out was `(change)`, which fires on blur. Select-all,
 * Delete, click away — and `Name = ''` reached the database. The canvas heading, the tab title
 * and the card in the gallery all went blank, and nothing on screen said why or offered a way
 * back. Escape did nothing, because nothing was listening.
 *
 * WHY A PURE FUNCTION AND NOT A DIRECTIVE. This suite runs in a node environment with no DOM
 * (see `vitest.config.ts`), so a directive's behaviour could only be asserted by reading its
 * source. The DECISION — commit this, put that back — is the part worth proving, and it is pure.
 * What is left over is three template bindings, which `inline-edit.wiring.spec.ts` checks.
 *
 * BOTH ARMS CARRY THE VALUE THE BOX SHOULD SHOW. That is the point of the shape: the caller
 * always assigns `outcome.value` and never branches to decide what to display. A refused edit
 * that left the box holding the refused text would be the same defect wearing a guard.
 */
import { describe, expect, it } from 'vitest';
import { resolveInlineEdit } from './inline-edit';

describe('resolveInlineEdit', () => {
  it('commits a real change', () => {
    expect(resolveInlineEdit('Leads Q4', 'Customer Acquisition Lead Form')).toEqual({
      kind: 'commit',
      value: 'Leads Q4',
    });
  });

  it('puts the previous name back when the box has been emptied', () => {
    // The reproduced defect. An empty name is not an edit an author can have meant: the only
    // way to reach it is select-all-then-delete, which is how you START retyping a name.
    expect(resolveInlineEdit('', 'Customer Acquisition Lead Form')).toEqual({
      kind: 'revert',
      value: 'Customer Acquisition Lead Form',
    });
  });

  it('treats a box holding only whitespace as emptied', () => {
    expect(resolveInlineEdit('   ', 'Leads Q4')).toEqual({ kind: 'revert', value: 'Leads Q4' });
  });

  it('writes nothing when the value came back unchanged', () => {
    // Tabbing through the field is not an edit, and a write per focus would put a Record Change
    // row and a dirty marker behind every accidental click on the title.
    expect(resolveInlineEdit('Leads Q4', 'Leads Q4')).toEqual({ kind: 'revert', value: 'Leads Q4' });
  });

  it('commits the trimmed text, not what was typed around it', () => {
    expect(resolveInlineEdit('  Leads Q4  ', 'Old name')).toEqual({ kind: 'commit', value: 'Leads Q4' });
  });

  it('counts a change that is only surrounding whitespace as no change at all', () => {
    // Follows from trimming, and is the case that would otherwise write on every stray space.
    expect(resolveInlineEdit('  Leads Q4  ', 'Leads Q4')).toEqual({ kind: 'revert', value: 'Leads Q4' });
  });
});
