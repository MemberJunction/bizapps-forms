/**
 * `onFormsWrite` hears a Forms row written elsewhere, whether a record's own save raised it or an
 * operation's caller announced it — through one decoder, for one entity.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { announceWrites, onFormsWrite } from './forms-writes';

/** What `BaseEntity.Save()` / `.Delete()` raise, for an entity of `name`. */
function raiseEntityEvent(type: 'save' | 'delete', name: string): void {
  MJGlobal.Instance.RaiseEvent({
    component: {},
    event: MJEventType.ComponentEvent,
    eventCode: BaseEntity.BaseEventCode,
    args: { type, baseEntity: { EntityInfo: { Name: name } } },
  });
}

describe('onFormsWrite', () => {
  it("hears a record's own save and delete of its entity, and nothing else", () => {
    const heard: string[] = [];
    const subscription = onFormsWrite('Forms', ['save', 'delete'], () => heard.push('x'));
    try {
      raiseEntityEvent('save', 'Forms');
      raiseEntityEvent('delete', 'Forms');
      raiseEntityEvent('save', 'Something else');
      expect(heard).toHaveLength(2);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('hears an announced operation write as a save', () => {
    const heard: string[] = [];
    const subscription = onFormsWrite('Form Distributions', ['save'], () => heard.push('x'));
    try {
      announceWrites(['Form Distributions', 'Forms']);
      expect(heard).toHaveLength(1);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('a delete-only listener ignores an announced write', () => {
    const heard: string[] = [];
    const subscription = onFormsWrite('Forms', ['delete'], () => heard.push('x'));
    try {
      announceWrites(['Forms']);
      raiseEntityEvent('save', 'Forms');
      expect(heard).toEqual([]);
      raiseEntityEvent('delete', 'Forms');
      expect(heard).toEqual(['x']);
    } finally {
      subscription.unsubscribe();
    }
  });
});

describe('onFormsWrite with debounceMs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns a burst of writes into ONE call after the burst settles', () => {
    vi.useFakeTimers();
    const heard: string[] = [];
    const subscription = onFormsWrite('Forms', ['save', 'delete'], () => heard.push('x'), { debounceMs: 750 });
    try {
      announceWrites(['Forms']);
      raiseEntityEvent('save', 'Forms');
      vi.advanceTimersByTime(500);
      announceWrites(['Forms']);
      vi.advanceTimersByTime(700);
      expect(heard).toEqual([]);

      vi.advanceTimersByTime(100);
      expect(heard).toEqual(['x']);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('drops a re-read still waiting when the listener goes away', () => {
    vi.useFakeTimers();
    const heard: string[] = [];
    const subscription = onFormsWrite('Forms', ['save'], () => heard.push('x'), { debounceMs: 750 });

    announceWrites(['Forms']);
    subscription.unsubscribe();
    vi.advanceTimersByTime(1000);

    expect(heard).toEqual([]);
  });
});

// Review of PR #348, F6: MJ's client provider replays an identical RunViews for DedupLingerMs (5 s)
// and drops that replay only on a BaseEntity save / delete / remote-invalidate event. An operation
// write raised only the Forms event, so a re-read within 5 s of the last one (the home's list right
// after Archive) was answered from the replay, with the archived form still in it.
describe('announceWrites and MJ client caches', () => {
  it('raises a BaseEntity remote-invalidate per written entity, which is what drops a lingered read', () => {
    const seen: { code: string; type?: string; entityName?: string }[] = [];
    const sub = MJGlobal.Instance.GetEventListener(false).subscribe((e) => {
      if (e.event === MJEventType.ComponentEvent && e.eventCode === BaseEntity.BaseEventCode) {
        const args = e.args as { type?: string; entityName?: string };
        seen.push({ code: e.eventCode, type: args.type, entityName: args.entityName });
      }
    });
    try {
      announceWrites(['MJ_BizApps_Forms: Forms', 'MJ_BizApps_Forms: Form Distributions']);
    } finally {
      sub.unsubscribe();
    }

    expect(seen).toEqual([
      { code: BaseEntity.BaseEventCode, type: 'remote-invalidate', entityName: 'MJ_BizApps_Forms: Forms' },
      { code: BaseEntity.BaseEventCode, type: 'remote-invalidate', entityName: 'MJ_BizApps_Forms: Form Distributions' },
    ]);
  });

  it('is not heard twice by a Forms listener: the remote-invalidate is neither a save nor a delete', () => {
    const heard: string[] = [];
    const sub = onFormsWrite('MJ_BizApps_Forms: Forms', ['save', 'delete'], () => heard.push('write'));
    try {
      announceWrites(['MJ_BizApps_Forms: Forms']);
    } finally {
      sub.unsubscribe();
    }

    expect(heard).toEqual(['write']);
  });
});
