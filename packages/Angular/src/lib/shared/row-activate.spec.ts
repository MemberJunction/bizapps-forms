/**
 * When a click on a row (a home form row, a template card, a builder question card) activates it.
 *
 * The defect (UI audit F05): these containers were `role="button" tabindex="0"` and held their own
 * buttons — axe `nested-interactive`, WCAG 4.1.2. Every inner control then had to stop the row's
 * click and keys itself (eleven `stopPropagation` calls), and one that forgot opened the form
 * instead of doing its job. The row now activates on a click that did not start in a control,
 * and its keyboard path is a real button inside it.
 */
import { describe, expect, it } from 'vitest';
import { rowClickActivates, startsInsideControl, type RowNode } from './row-activate';

function node(tagName: string, parent: RowNode | null, attrs: Record<string, string> = {}, editable = false): RowNode {
  return {
    tagName,
    parentElement: parent,
    getAttribute: (name: string) => attrs[name] ?? null,
    hasAttribute: (name: string) => name in attrs,
    isContentEditable: editable,
  };
}

const page = node('MAIN', null);
const host = node('ARTICLE', page, { class: 'mjf-row' });
const text = node('SPAN', host);
const actions = node('DIV', host);
const action = node('BUTTON', actions);
const actionIcon = node('I', action);

const click = (target: RowNode | null, extra: Partial<Parameters<typeof rowClickActivates>[0]> = {}) =>
  rowClickActivates({ target, host, selectionInsideHost: false, pointerTravelPx: 0, ...extra });

describe('startsInsideControl', () => {
  it('is true for the icon inside an action button', () => {
    expect(startsInsideControl(actionIcon, host)).toBe(true);
  });

  it('is false for plain text in the row', () => {
    expect(startsInsideControl(text, host)).toBe(false);
  });

  it.each([
    ['a link', node('A', host, { href: '/x' })],
    ['an input', node('INPUT', host)],
    ['a select', node('SELECT', host)],
    ['a textarea', node('TEXTAREA', host)],
    ['a label', node('LABEL', host)],
    ['a summary', node('SUMMARY', host)],
    ['role=button', node('DIV', host, { role: 'button' })],
    ['role=checkbox', node('DIV', host, { role: 'checkbox' })],
    ['role=radio', node('DIV', host, { role: 'radio' })],
    ['role=switch', node('DIV', host, { role: 'switch' })],
    ['role=menuitem', node('DIV', host, { role: 'menuitem' })],
    ['contenteditable', node('DIV', host, {}, true)],
  ])('is true inside %s', (_label, control) => {
    expect(startsInsideControl(node('SPAN', control), host)).toBe(true);
  });

  it('is false for an anchor without href, which is not a control', () => {
    expect(startsInsideControl(node('SPAN', node('A', host)), host)).toBe(false);
  });

  it('stops at the host: a row that is itself inside a button is still activatable from its text', () => {
    const outerButton = node('BUTTON', page);
    const nestedHost = node('ARTICLE', outerButton);
    expect(startsInsideControl(node('SPAN', nestedHost), nestedHost)).toBe(false);
  });

  it('is false when the target is the host itself', () => {
    expect(startsInsideControl(host, host)).toBe(false);
  });
});

describe('rowClickActivates', () => {
  it('activates on a click on the row text', () => {
    expect(click(text)).toBe(true);
  });

  it('leaves a click on an inner control to that control', () => {
    expect(click(actionIcon)).toBe(false);
  });

  it('does not activate when the click ends a text selection inside the row', () => {
    expect(click(text, { selectionInsideHost: true })).toBe(false);
  });

  it('does not activate on the click a drag leaves behind', () => {
    expect(click(text, { pointerTravelPx: 5 })).toBe(false);
  });

  it('still activates on a click with a little jitter', () => {
    expect(click(text, { pointerTravelPx: 4 })).toBe(true);
  });

  it('does not activate without a target', () => {
    expect(click(null)).toBe(false);
  });
});
