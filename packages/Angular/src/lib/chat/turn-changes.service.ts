/**
 * What a chat turn changed, and how to put it back.
 *
 * ── IT READS THE DATABASE'S OWN RECORD OF THE CHANGE, NOT THE ASSISTANT'S ACCOUNT OF IT. ─────
 * MJ writes a `MJ: Record Changes` row for every save, carrying `{field, oldValue, newValue}` per
 * column — the entities in this schema all have `TrackRecordChanges` on, so this is already there
 * and needs no table of ours. Two things follow from reading it rather than trusting the reply:
 * the summary is what actually happened (a model that says "I warmed up the palette" and wrote one
 * token gets reported as one token), and undo has a real previous value to write back rather than
 * a second guess at what "warmer" used to mean.
 *
 * ── ONLY TWO KINDS, DELIBERATELY. ────────────────────────────────────────────────────────────
 * A restyle is one field on one `Form Styles` row; a picture is one field on one `Form Screens`
 * row. Both put back with a value we hold. A structural edit is pages, questions and options at
 * once — reversing that correctly is a version restore, and an Undo button that half-reverses a
 * form is worse than no button, so it is not offered. {@link FormChatTurnChange} says the same
 * thing in the contract.
 */
import { Injectable } from '@angular/core';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { DeepDiffer } from '@memberjunction/global';
import type {
  FormChatTurnChange,
  mjBizAppsFormsFormScreenEntity,
  mjBizAppsFormsFormStyleEntity,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { BRAND_TOKENS, BUTTON_RADIUS_TOKEN } from '../builder/style-tokens';

/** The shape MJ stores in `RecordChange.ChangesJSON`: one entry per changed column. */
interface RecordChangeFields {
  [field: string]: { field: string; oldValue: unknown; newValue: unknown } | undefined;
}

const RECORD_CHANGES_ENTITY = 'MJ: Record Changes';

/** The field each undoable kind writes, and the entity it lives on. */
const UNDOABLE = {
  style: { entity: FORMS_ENTITY.FormStyle, field: 'CSSVariables' },
  image: { entity: FORMS_ENTITY.FormScreen, field: 'MediaURL' },
} as const;

/**
 * Author-facing names for the style tokens, so a summary reads "Accent, Page background" rather
 * than "--mjf-accent, --mjf-page-bg". Derived from {@link BRAND_TOKENS} so a token added there is
 * covered here by construction; anything unnamed falls back to its own token name, which is ugly
 * but never wrong.
 */
const TOKEN_LABELS: Readonly<Record<string, string>> = {
  [BRAND_TOKENS.primary]: 'Accent',
  [BRAND_TOKENS.primaryStrong]: 'Accent (hover)',
  [BRAND_TOKENS.pageBg]: 'Page background',
  [BRAND_TOKENS.cardBg]: 'Card background',
  [BRAND_TOKENS.fontBody]: 'Body font',
  [BRAND_TOKENS.fontDisplay]: 'Heading font',
  [BRAND_TOKENS.ink]: 'Text colour',
  [BRAND_TOKENS.onAccent]: 'Button label colour',
  [BRAND_TOKENS.answer]: 'Selected answer',
  [BRAND_TOKENS.pageBgImage]: 'Background image',
  // The five `setLayout` writes. They land in the same CSSVariables blob a restyle does, so a
  // summary that met one and had no name for it would print a raw custom-property name at an
  // author.
  [BRAND_TOKENS.titleSize]: 'Title size',
  [BRAND_TOKENS.questionSize]: 'Question size',
  [BRAND_TOKENS.titleAlign]: 'Title alignment',
  [BRAND_TOKENS.questionAlign]: 'Question alignment',
  [BUTTON_RADIUS_TOKEN]: 'Button corners',
};

/** How many tokens a summary names before it stops listing and starts counting. */
const MAX_NAMED = 3;

@Injectable()
export class TurnChangesService {
  private readonly rv = new RunView();

  /**
   * What the turn did to this record, or null when nothing is recorded for it.
   *
   * `since` is when the message was sent: without it a turn that changed nothing would happily
   * describe — and offer to undo — a change the author made by hand ten minutes earlier.
   */
  public async describe(
    kind: FormChatTurnChange['kind'],
    recordId: string,
    since: Date,
  ): Promise<FormChatTurnChange | null> {
    const target = UNDOABLE[kind];
    const changed = await this.latestChange(target.entity, recordId, since);
    const field = changed?.[target.field];
    if (!field) {
      return null;
    }
    const previous = typeof field.oldValue === 'string' ? field.oldValue : '';
    return {
      kind,
      recordId,
      summary:
        kind === 'style'
          ? summariseStyle(previous, typeof field.newValue === 'string' ? field.newValue : '')
          : previous
            ? 'Replaced the screen picture'
            : 'Added a screen picture',
      previous,
    };
  }

  /**
   * Put the previous value back.
   *
   * Typed properties on the generated entities rather than a generic `Set(field, value)` — this
   * only ever writes two known columns, and the ban on stringly-typed field access is exactly
   * what keeps a rename from turning this into a silent no-op.
   */
  public async undo(change: FormChatTurnChange): Promise<boolean> {
    const md = new Metadata();
    try {
      if (change.kind === 'style') {
        const style = await md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(FORMS_ENTITY.FormStyle);
        if (!(await style.Load(change.recordId))) {
          return this.failed(`Could not load style ${change.recordId}`);
        }
        style.CSSVariables = change.previous;
        return (await style.Save()) || this.failed(style.LatestResult?.CompleteMessage ?? 'save failed');
      }
      const screen = await md.GetEntityObject<mjBizAppsFormsFormScreenEntity>(FORMS_ENTITY.FormScreen);
      if (!(await screen.Load(change.recordId))) {
        return this.failed(`Could not load screen ${change.recordId}`);
      }
      // Empty string, not null: "there was no picture" is a value we are restoring, not an absence
      // of instruction.
      screen.MediaURL = change.previous;
      return (await screen.Save()) || this.failed(screen.LatestResult?.CompleteMessage ?? 'save failed');
    } catch (error) {
      return this.failed(error instanceof Error ? error.message : String(error));
    }
  }

  /** The newest recorded change to this record since `since`, parsed, or undefined. */
  private async latestChange(
    entityName: string,
    recordId: string,
    since: Date,
  ): Promise<RecordChangeFields | undefined> {
    const md = new Metadata();
    const entity = md.EntityByName(entityName);
    if (!entity) {
      LogError(`[Forms chat] ${entityName} is not in metadata; cannot read what changed.`);
      return undefined;
    }
    // A second of slack: the row is written inside the same save the turn performed, and the two
    // clocks (browser and database) are not the same clock.
    const from = new Date(since.getTime() - 1000).toISOString();
    const view = await this.rv.RunView<{ ChangesJSON: string }>({
      EntityName: RECORD_CHANGES_ENTITY,
      ExtraFilter: `EntityID='${entity.ID}' AND RecordID='${sqlSafe(recordId)}' AND ChangedAt >= '${from}'`,
      OrderBy: 'ChangedAt DESC',
      Fields: ['ChangesJSON'],
      ResultType: 'simple',
      MaxRows: 1,
    });
    if (!view.Success) {
      LogError(`[Forms chat] Could not read record changes: ${view.ErrorMessage}`);
      return undefined;
    }
    return parseChanges(view.Results?.[0]?.ChangesJSON);
  }

  /** Log and answer false, so every failure path here says what it was doing. */
  private failed(detail: string): false {
    LogError(`[Forms chat] Undo failed: ${detail}`);
    return false;
  }
}

/** A GUID cannot contain a quote, but this string reaches a filter, so it is checked, not trusted. */
function sqlSafe(value: string): string {
  return value.replace(/'/g, "''");
}

function parseChanges(json: string | undefined): RecordChangeFields | undefined {
  if (!json) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as RecordChangeFields) : undefined;
  } catch (error) {
    LogError(`[Forms chat] Unreadable ChangesJSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/**
 * Name the tokens whose values actually moved, using MJ's own differ.
 *
 * `CSSVariables` is a JSON object of token → value, so the recorded change says only "this blob
 * became that blob". DeepDiffer turns the two blobs back into the handful of tokens that differ,
 * which is the difference between "Changed the theme" and "Accent, Page background".
 */
function summariseStyle(previousJson: string, currentJson: string): string {
  const before = safeParseObject(previousJson);
  const after = safeParseObject(currentJson);
  if (!before || !after) {
    return 'Changed the theme';
  }
  const diff = new DeepDiffer({ maxDepth: 2 }).diff(before, after);
  const names = diff.changes
    .map((c) => TOKEN_LABELS[c.path] ?? c.path)
    .filter((name, i, all) => all.indexOf(name) === i);
  if (names.length === 0) {
    return 'Changed the theme';
  }
  return names.length <= MAX_NAMED
    ? names.join(', ')
    : `${names.slice(0, MAX_NAMED).join(', ')} and ${names.length - MAX_NAMED} more`;
}

function safeParseObject(json: string): Record<string, unknown> | undefined {
  if (!json) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    // A malformed blob is not an error worth surfacing: the caller falls back to a generic
    // summary, which is what it would have said anyway.
    return undefined;
  }
}
