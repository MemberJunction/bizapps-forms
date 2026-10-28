/**
 * `RowActivateDirective` exercised as a class (final review #7): its own glue — measuring pointer
 * travel from press to release, reading the selection, forgetting the press afterwards — around
 * the pure `rowClickActivates`, which `row-activate.spec.ts` covers. Built in an injection context
 * over a fake host, since this suite has no DOM; the handlers are driven with plain event objects.
 */
import '@angular/compiler';
import { ElementRef, Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { RowActivateDirective } from './row-activate.directive';

interface FakeNode {
  tagName: string;
  parentElement: FakeNode | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

function node(tagName: string, parentElement: FakeNode | null): FakeNode {
  return { tagName, parentElement, getAttribute: () => null, hasAttribute: () => false };
}

/** A host whose document reports `selection` as the current text selection. */
function fixture(selection: { isCollapsed: boolean; anchorNode: FakeNode | null } = { isCollapsed: true, anchorNode: null }) {
  const host = {
    ...node('ARTICLE', null),
    ownerDocument: { getSelection: () => selection },
    contains: (n: FakeNode | null) => {
      for (let cur = n; cur; cur = cur.parentElement) if (cur === (host as unknown as FakeNode)) return true;
      return false;
    },
  };
  const text = node('SPAN', host as unknown as FakeNode);
  const button = node('BUTTON', host as unknown as FakeNode);
  const injector = Injector.create({ providers: [{ provide: ElementRef, useValue: new ElementRef(host) }] });
  const directive = runInInjectionContext(injector, () => new RowActivateDirective());
  const emitted: unknown[] = [];
  directive.mjfRowActivate.subscribe((e) => emitted.push(e));
  return { directive: directive as unknown as Handlers, text, button, emitted };
}

interface Handlers {
  onPointerDown(e: { clientX: number; clientY: number }): void;
  onClick(e: { clientX: number; clientY: number; target: FakeNode }): void;
}

describe('RowActivateDirective', () => {
  it('emits for a click on the row text with no travel', () => {
    const { directive, text, emitted } = fixture();
    directive.onPointerDown({ clientX: 10, clientY: 10 });
    directive.onClick({ clientX: 10, clientY: 10, target: text });
    expect(emitted).toHaveLength(1);
  });

  it('emits nothing for the release that ends a 10px drag', () => {
    const { directive, text, emitted } = fixture();
    directive.onPointerDown({ clientX: 10, clientY: 10 });
    directive.onClick({ clientX: 16, clientY: 18, target: text });
    expect(emitted).toEqual([]);
  });

  it('forgets the press: the next click without one is measured from nowhere, not from the old press', () => {
    const { directive, text, emitted } = fixture();
    directive.onPointerDown({ clientX: 0, clientY: 0 });
    directive.onClick({ clientX: 50, clientY: 0, target: text });
    directive.onClick({ clientX: 50, clientY: 0, target: text });
    expect(emitted).toHaveLength(1);
  });

  it('emits nothing for a click on a control inside the row', () => {
    const { directive, button, emitted } = fixture();
    directive.onClick({ clientX: 0, clientY: 0, target: button });
    expect(emitted).toEqual([]);
  });

  it('emits nothing when the click ends a text selection inside the row', () => {
    const selection = { isCollapsed: false, anchorNode: null as FakeNode | null };
    const { directive, text, emitted } = fixture(selection);
    selection.anchorNode = text;
    directive.onClick({ clientX: 0, clientY: 0, target: text });
    expect(emitted).toEqual([]);
  });
});
