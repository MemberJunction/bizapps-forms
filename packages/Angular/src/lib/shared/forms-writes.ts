/**
 * "Some Forms rows changed" — heard the same way whether a record saved them or an operation did.
 *
 * Three surfaces stay mounted behind other tabs and re-read when rows they show change elsewhere:
 * the Forms home grid, the template gallery, and the builder (its share-link header, its publish
 * state over automations, its "Saved as template" indicator). They used to listen only for MJ's
 * own signal — every `BaseEntity.Save()` / `.Delete()` raises an MJGlobal `ComponentEvent` tagged
 * `BaseEntity.BaseEventCode` — and each decoded that event shape separately.
 *
 * Since #303 the writes that matter most are Remote Operations (publish, clone, archive, the
 * share-link and automation verbs). The server writes those rows, so no client `BaseEntity` raises
 * anything, and every listener above went quiet for exactly the edits it existed to notice. So an
 * operation's caller ANNOUNCES the entities it changed ({@link announceWrites}, done by
 * `runOperation`), and {@link onFormsWrite} hears both kinds through one decoder.
 */
import { BaseEntity, type BaseEntityEvent } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';

/** The MJGlobal event code an operation write is announced under. */
export const FORMS_OPERATION_WRITE_EVENT = 'MJForms.OperationWrite';

/** What {@link onFormsWrite} hands back: stop listening (and drop any re-read still waiting). */
export interface FormsWriteSubscription {
  unsubscribe(): void;
}

/** What changed: a save or a delete of a row of `entityName`. */
export type FormsWriteKind = 'save' | 'delete';

interface OperationWriteArgs {
  entityName: string;
  kind: FormsWriteKind;
}

/**
 * Tell every listening surface that an operation wrote rows of these entities — saved them, or
 * (`Forms.DeleteTemplate`) deleted one, which a listener for deletes must hear as a delete.
 */
export function announceWrites(entityNames: readonly string[], kind: FormsWriteKind = 'save'): void {
  for (const entityName of entityNames) {
    const args: OperationWriteArgs = { entityName, kind };
    MJGlobal.Instance.RaiseEvent({ component: {}, event: MJEventType.ComponentEvent, eventCode: FORMS_OPERATION_WRITE_EVENT, args });
    // MJ's own "the server changed rows you cannot see" signal. Its client provider replays an
    // identical RunViews for a few seconds and drops that replay only on a BaseEntity save, delete
    // or remote-invalidate, so without this a re-read right after the operation (the home's list
    // after Archive) got the rows from before it. onFormsWrite ignores this type, so no Forms
    // listener hears the write twice.
    const invalidate: BaseEntityEvent = { type: 'remote-invalidate', baseEntity: null, entityName, payload: null };
    MJGlobal.Instance.RaiseEvent({ component: {}, event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode, args: invalidate });
  }
}

/**
 * Run `onWrite` whenever a row of `entityName` is written by any other surface — a record's own
 * save or delete, or an announced operation write of either kind.
 *
 * `debounceMs` coalesces a burst into ONE call that many milliseconds after the last write. The
 * home grid and the template gallery use it: every structural edit in an open builder writes the
 * `Form` row (its graph root), so without it a grid behind the builder tab re-read itself once per
 * reorder, insert and delete.
 *
 * `shouldHandle` is checked when a write arrives, before it can be deferred. A surface handling
 * its own write can ignore its announcement even if it finishes before the debounce expires.
 *
 * `operationsOnly` hears announced operation writes and ignores records' own save events — for a
 * surface that only needs to catch up with what the SERVER wrote (its own record saves it already
 * knows about).
 */
export function onFormsWrite(
  entityName: string,
  kinds: readonly FormsWriteKind[],
  onWrite: () => void,
  options: { debounceMs?: number; operationsOnly?: boolean; shouldHandle?: () => boolean } = {},
): FormsWriteSubscription {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = (): void => {
    if (options.shouldHandle && !options.shouldHandle()) {
      return;
    }
    if (!options.debounceMs) {
      onWrite();
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      onWrite();
    }, options.debounceMs);
  };
  // Widened rather than cast: the caller states its intent with a literal union, and the event
  // hands back a bare string. Assigning the narrow array to the wide type is the safe direction.
  const wanted: readonly string[] = kinds;
  const subscription = MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
    if (event.event !== MJEventType.ComponentEvent) {
      return;
    }
    if (event.eventCode === FORMS_OPERATION_WRITE_EVENT) {
      const args = event.args as OperationWriteArgs | undefined;
      if (args?.entityName === entityName && wanted.includes(args.kind ?? 'save')) {
        fire();
      }
      return;
    }
    if (options.operationsOnly || event.eventCode !== BaseEntity.BaseEventCode) {
      return;
    }
    const args = event.args as { type?: string; baseEntity?: BaseEntity | null } | undefined;
    if (!args?.type || !wanted.includes(args.type) || args.baseEntity?.EntityInfo?.Name !== entityName) {
      return;
    }
    fire();
  });
  return {
    unsubscribe: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      subscription.unsubscribe();
    },
  };
}
