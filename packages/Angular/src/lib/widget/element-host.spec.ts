import { describe, expect, it } from 'vitest';

import { keepInPlace, type KeptNode } from './element-host';

/** A minimal DOM: a parent with an ordered child list, enough to detach and reinsert one node. */
class FakeParent {
  public readonly children: FakeNode[] = [];
  public insertBefore(node: FakeNode, before: FakeNode | null): FakeNode {
    this.detach(node);
    const at = before ? this.children.indexOf(before) : -1;
    this.children.splice(at === -1 ? this.children.length : at, 0, node);
    node.parent = this;
    return node;
  }
  public detach(node: FakeNode): void {
    const at = this.children.indexOf(node);
    if (at !== -1) {
      this.children.splice(at, 1);
      node.parent = null;
    }
  }
}

class FakeNode implements KeptNode {
  public parent: FakeParent | null = null;
  public constructor(public readonly name: string) {}
  public get isConnected(): boolean { return this.parent !== null; }
  public get parentNode(): FakeParent | null { return this.parent; }
  public get nextSibling(): FakeNode | null {
    if (!this.parent) return null;
    return this.parent.children[this.parent.children.indexOf(this) + 1] ?? null;
  }
}

function page(): { parent: FakeParent; before: FakeNode; host: FakeNode; after: FakeNode } {
  const parent = new FakeParent();
  const [before, host, after] = [new FakeNode('before'), new FakeNode('host'), new FakeNode('after')];
  for (const n of [before, host, after]) parent.insertBefore(n, null);
  return { parent, before, host, after };
}

describe('keepInPlace', () => {
  it('puts the node back where it was when the work detached it', () => {
    const { parent, host } = page();
    keepInPlace(host, () => parent.detach(host));
    expect(host.isConnected).toBe(true);
    expect(parent.children.map((n) => n.name)).toEqual(['before', 'host', 'after']);
  });

  it('keeps the position when the node was the last child', () => {
    const { parent, after } = page();
    keepInPlace(after, () => parent.detach(after));
    expect(parent.children.map((n) => n.name)).toEqual(['before', 'host', 'after']);
  });

  it('leaves the node alone when the work did not detach it', () => {
    const { parent, host } = page();
    let ran = false;
    keepInPlace(host, () => { ran = true; });
    expect(ran).toBe(true);
    expect(parent.children.map((n) => n.name)).toEqual(['before', 'host', 'after']);
  });

  it('does not attach a node that was not connected to begin with', () => {
    const loose = new FakeNode('loose');
    keepInPlace(loose, () => undefined);
    expect(loose.isConnected).toBe(false);
  });

  it('still reinserts the node when the work throws, and rethrows', () => {
    const { parent, host } = page();
    expect(() => keepInPlace(host, () => { parent.detach(host); throw new Error('teardown failed'); })).toThrow('teardown failed');
    expect(parent.children.map((n) => n.name)).toEqual(['before', 'host', 'after']);
  });
});
