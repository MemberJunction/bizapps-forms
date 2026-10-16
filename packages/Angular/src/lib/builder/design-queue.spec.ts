/**
 * Every Design-tab write joins the builder's one save queue (fix round 2 of #303 Task 10a).
 *
 * The Design panel used to provide its OWN `DesignStateService`, so the builder's
 * `UseSaveQueue` configured an instance nothing wrote through, and "apply this style" saved the
 * builder's form record outside the queue: not flushed before a publish, and free to run over a
 * structural save.
 */
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { mjBizAppsFormsFormEntity } from '@mj-biz-apps/forms-entities';
import { DesignPanelComponent } from './design-panel.component';
import { DesignStateService } from './design-state.service';
import { fakeTree, GraphedBuilderState, type FakeRow } from './testing/fake-structure-graph';

describe('the Design panel', () => {
  it('declares no DesignStateService of its own, so it uses the builder\'s queued instance', () => {
    // The component's decorator metadata, as Angular's JIT records it on the class.
    const annotations = (Reflect.get(DesignPanelComponent, '__annotations__') ?? []) as Array<{ providers?: unknown[] }>;
    const providers = annotations.flatMap((a) => a.providers ?? []);
    expect(annotations.length).toBeGreaterThan(0);
    expect(providers).not.toContain(DesignStateService);
  });
});

describe('a style change racing a structural save', () => {
  it('waits for the structural save, and is flushed with the rest', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }] }]);
    const state = new GraphedBuilderState(store);
    const design = new DesignStateService();
    design.UseSaveQueue((entity) => state.save(entity));
    const events: string[] = [];
    const form = tree.form as unknown as FakeRow;
    form['Save'] = async () => {
      events.push(`form saved with StyleID ${String(form['StyleID'])}`);
      return true;
    };
    let release = (): void => undefined;
    store.hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    tree.pages[0].questions.reverse();
    const reorder = state.persistQuestionOrder(tree, tree.pages[0]);
    await new Promise((r) => setTimeout(r, 0));
    const applied = design.applyStyleToForm(tree.form as mjBizAppsFormsFormEntity, 'style-9');
    const flushing = state.flushPendingSaves();
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual([]);

    release();
    await reorder;
    await flushing;

    expect(await applied).toBe(true);
    expect(events).toEqual(['form saved with StyleID style-9']);
  });
});
