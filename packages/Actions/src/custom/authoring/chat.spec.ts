import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The chat turn, driven offline: a stub assistant, a fake entity layer, no model and no database.
 *
 * What is worth proving here is the DISPATCH — that a reply-only turn writes nothing, that a
 * create turn reaches the generation pipeline, that a restyle goes through the same contrast gate
 * a generated theme does, and that a failure anywhere lands in the thread as a message the author
 * can read rather than as a lost question.
 */
interface SavedRow {
  entity: string;
  fields: Record<string, unknown>;
}

const saved: SavedRow[] = [];
const rows = new Map<string, Array<Record<string, unknown>>>();
let minted = 0;

/**
 * Every `ExtraFilter` the fake was handed, in order.
 *
 * Recorded because asserting on OUTCOMES could not distinguish a guard that works from a fixture
 * that happens to return nothing: an injected id names no row, so `Load` fails and the context
 * comes back undefined whether or not anything validated it. Three of these tests passed with the
 * guard fully neutered for exactly that reason. The filter string is the thing the guard exists to
 * protect, so it is the thing to look at.
 */
const seenFilters: string[] = [];
/**
 * Every view the turn issued, so a test can assert on the QUERY and not only on its result.
 *
 * Needed because "read everything and keep the last ten" and "ask for ten" return byte-identical
 * results — the difference is only visible in what was asked for, which is exactly the thing that
 * costs money on a long thread.
 */
const seenViews: Array<{ entity: string; orderBy?: string; maxRows?: number }> = [];
/**
 * Entity whose next read reports failure.
 *
 * A failed read is NOT an empty read, and the two are only distinguishable if the fake can
 * produce the first. Without this, "no conversation yet" and "the conversation query broke" look
 * identical to every test in this file.
 */
let viewFailsFor: string | null = null;

function fakeGuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

class FakeEntity {
  ID = '';
  constructor(private readonly entityName: string) {}
  get LatestResult(): { Message: string; CompleteMessage: string } {
    return { Message: 'forced failure', CompleteMessage: 'forced failure' };
  }
  NewRecord(): void {
    this.ID = fakeGuid(++minted);
  }
  async Load(id: string): Promise<boolean> {
    const row = (rows.get(this.entityName) ?? []).find((r) => r.ID === id);
    if (!row) {
      return false;
    }
    Object.assign(this, row);
    return true;
  }
  async Save(): Promise<boolean> {
    if (!this.ID) {
      this.ID = fakeGuid(++minted);
    }
    saved.push({ entity: this.entityName, fields: snapshot(this) });
    const table = rows.get(this.entityName) ?? [];
    if (!table.some((r) => r.ID === this.ID)) {
      table.push(this as unknown as Record<string, unknown>);
      rows.set(this.entityName, table);
    }
    return true;
  }
}

function snapshot(entity: FakeEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    if (k !== 'entityName') {
      out[k] = v;
    }
  }
  return out;
}

function matchesFilter(row: Record<string, unknown>, filter: string | undefined): boolean {
  if (!filter) {
    return true;
  }
  // Only the shapes this code emits; anything else throws rather than silently matching all.
  const conj = filter.split(' AND ').map((f) => f.trim());
  return conj.every((clause) => {
    const eq = /^(\w+)='([^']*)'$/.exec(clause);
    if (eq) return String(row[eq[1]] ?? '') === eq[2];
    const notEq = /^(\w+)\s*<>\s*'([^']*)'$/.exec(clause);
    if (notEq) return String(row[notEq[1]] ?? '') !== notEq[2];
    const inList = /^(\w+) IN \(([^)]*)\)$/.exec(clause);
    if (inList) {
      const allowed = new Set([...inList[2].matchAll(/'([^']*)'/g)].map((m) => m[1]));
      return allowed.has(String(row[inList[1]] ?? ''));
    }
    // NUMERIC, matching the sibling fake in `apply-edits.spec.ts`. These two landed on different
    // rules for the same `IsTemplate = 0` clause — one compared numbers, the other stringified
    // booleans — so a fixture written in the other file's spelling was silently dropped here, and
    // the failure named the handles rather than the column. A bit column is 0/1 in SQL and either
    // `false` or `0` in a fixture; both must read the same.
    const num = /^(\w+)\s*=\s*(\d+)$/.exec(clause);
    if (num) return Number(row[num[1]] ?? 0) === Number(num[2]);
    throw new Error(`fake RunView cannot read filter clause: ${clause}`);
  });
}

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  Metadata: class {
    async GetEntityObject(entityName: string): Promise<FakeEntity> {
      return new FakeEntity(entityName);
    }
  },
  RunView: class {
    /** The batched form. `loadFormSnapshot` issues its six reads together, as production does. */
    async RunViews(all: Array<{ EntityName: string; ExtraFilter?: string }>): Promise<unknown[]> {
      const one = new (this.constructor as never as { new (): { RunView(p: unknown): Promise<unknown> } })();
      return Promise.all(all.map((p) => one.RunView(p)));
    }
    async RunView(params: {
      EntityName: string;
      ExtraFilter?: string;
      OrderBy?: string;
      MaxRows?: number;
    }): Promise<{
      Success: boolean;
      Results: unknown[];
    }> {
      // Recorded BEFORE matching: `matchesFilter` throws on a clause it cannot read, and an
      // injected filter is exactly such a clause.
      if (params.ExtraFilter) {
        seenFilters.push(params.ExtraFilter);
      }
      seenViews.push({ entity: params.EntityName, orderBy: params.OrderBy, maxRows: params.MaxRows });
      if (viewFailsFor === params.EntityName) {
        viewFailsFor = null;
        return { Success: false, ErrorMessage: 'connection reset', Results: [] };
      }
      const table = rows.get(params.EntityName) ?? [];
      let matched = table.filter((r) => matchesFilter(r, params.ExtraFilter));
      // ORDER AND LIMIT ARE MODELLED, because a caller that reads the whole table and trims in
      // memory is indistinguishable from one that asks the database for ten rows unless the fake
      // enforces the difference. Rows are appended in creation order, so index IS `__mj_CreatedAt`.
      if (params.OrderBy?.toUpperCase().includes('DESC')) {
        matched = [...matched].reverse();
      }
      if (typeof params.MaxRows === 'number') {
        matched = matched.slice(0, params.MaxRows);
      }
      return { Success: true, Results: matched };
    }
  },
  UserInfo: class {
    ID = 'user-1';
  },
}));

import { UserInfo } from '@memberjunction/core';
import { runChatTurn, setChatAssistantModel, setChatImageModel } from './chat.action';
import { setStagedAuthoringModel, setFormDesignerModel } from './generate-form.action';
import { chatExternalId, MAX_CHAT_HISTORY_TURNS } from './chat-assistant';
import { resetGeneratedImageStore, setGeneratedImageStore } from './generated-image-store';
import type { RunActionParams } from '@memberjunction/actions-base';
import type { FormChatResponse } from '@mj-biz-apps/forms-entities';

/**
 * GUID-shaped fixture ids.
 *
 * Not decoration: every id here reaches a `RunView.ExtraFilter` and is validated before it does, so
 * a fixture like `FORM_ID` is now correctly REJECTED. A fake that mints ids production would
 * refuse cannot exercise the path it stands in for — the same lesson the builder's fake taught.
 */
const FORM_ID = '11111111-2222-4333-8444-555555555555';
const STYLE_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';

const SCREEN_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const CONVERSATION = 'MJ: Conversations';
const DETAIL = 'MJ: Conversation Details';
const STYLE = 'MJ_BizApps_Forms: Form Styles';
const SCREEN = 'MJ_BizApps_Forms: Form Screens';

const user = new UserInfo();

/** An assistant that returns one fixed decision. */
function assistant(response: FormChatResponse | string) {
  const respond = vi.fn(async () =>
    typeof response === 'string' ? response : JSON.stringify(response),
  );
  setChatAssistantModel({ respond });
  return respond;
}

/** Run one turn and hand back the params bag so outputs can be read. */
async function turn(message: string, inputs: Record<string, string> = {}) {
  const params = {
    Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' as const })),
    ContextUser: user,
  };
  // `as unknown as` rather than `as any`, which CLAUDE.md forbids outright and which this file
  // was the repo's only use of. The double assertion is the convention the other action specs
  // here already follow: the fixture is a deliberate partial of `RunActionParams`, carrying the
  // two fields `runChatTurn` reads.
  const result = await runChatTurn(message, params as unknown as RunActionParams, user);
  const out = (name: string): unknown => params.Params.find((p) => p.Name === name)?.Value;
  return { result, out, params };
}

const turns = (): SavedRow[] => saved.filter((r) => r.entity === DETAIL);

beforeEach(() => {
  saved.length = 0;
  rows.clear();
  seenFilters.length = 0;
  seenViews.length = 0;
  viewFailsFor = null;
  minted = 0;
  resetGeneratedImageStore();
  setChatAssistantModel({ respond: async () => JSON.stringify({ reply: 'ok', action: 'none' }) });
});

describe('a reply-only turn', () => {
  it('records both sides and changes nothing else', async () => {
    assistant({ reply: 'Navy pairs well with a warm off-white.', action: 'none' });
    const { result, out } = await turn('What goes with navy?');

    expect(result.Success).toBe(true);
    expect(out('Action')).toBe('none');
    expect(out('Reply')).toContain('warm off-white');
    expect(turns().map((t) => t.fields.Role)).toEqual(['User', 'AI']);
    expect(turns()[0].fields.Message).toBe('What goes with navy?');
    // Nothing but the conversation and its two turns was written.
    const touched = new Set(saved.map((r) => r.entity));
    expect([...touched].sort()).toEqual([CONVERSATION, DETAIL].sort());
  });

  it('starts a thread scoped to the form, and reuses it next time', async () => {
    await turn('hello', { FormID: FORM_ID });
    const conversations = saved.filter((r) => r.entity === CONVERSATION);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].fields.ExternalID).toBe(chatExternalId(FORM_ID));

    saved.length = 0;
    await turn('hello again', { FormID: FORM_ID });
    // No second conversation row: the existing thread was found by its ExternalID.
    expect(saved.filter((r) => r.entity === CONVERSATION)).toHaveLength(0);
  });

  it('keeps a form thread separate from the forms-list thread', async () => {
    await turn('about this form', { FormID: FORM_ID });
    await turn('about nothing in particular');
    const ids = saved.filter((r) => r.entity === CONVERSATION).map((r) => r.fields.ExternalID);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain('mj-forms:home');
  });

  it('shows the assistant the prior turns', async () => {
    const respond = assistant({ reply: 'ok', action: 'none' });
    await turn('first');
    await turn('second');
    const history = respond.mock.calls.at(-1)?.[0].history ?? [];
    expect(history.map((t: { message: string }) => t.message)).toContain('first');
  });

  it('caps how much history the assistant is shown', async () => {
    const respond = assistant({ reply: 'ok', action: 'none' });
    for (let i = 0; i < MAX_CHAT_HISTORY_TURNS + 6; i++) {
      await turn(`message ${i}`);
    }
    const history = respond.mock.calls.at(-1)?.[0].history ?? [];
    expect(history.length).toBeLessThanOrEqual(MAX_CHAT_HISTORY_TURNS);
  });

  it('asks the database for the last few turns rather than the whole thread', async () => {
    // The cap above is satisfied by reading everything and trimming in memory, which is what this
    // did: a long-lived thread cost more rows on every message for a window that never grows.
    // These assertions fail on an unbounded read, because the fake honours OrderBy and MaxRows.
    const respond = assistant({ reply: 'ok', action: 'none' });
    for (let i = 0; i < MAX_CHAT_HISTORY_TURNS + 6; i++) {
      await turn(`message ${i}`);
    }

    // THE ASSERTION IS ON THE QUERY, deliberately. Reading the whole thread and slicing the last
    // ten produces byte-identical `history` to asking for ten — same messages, same order — so an
    // assertion about the result cannot tell the two apart, and one written that way passed with
    // the bound removed. What differs is what was asked of the database.
    const historyReads = seenViews.filter((v) => v.entity === 'MJ: Conversation Details' && v.maxRows !== 1);
    expect(historyReads.length).toBeGreaterThan(0);
    for (const read of historyReads) {
      expect(read.maxRows).toBe(MAX_CHAT_HISTORY_TURNS);
      expect(read.orderBy).toMatch(/DESC/i);
    }

    // And the window still reads oldest-first, holding the most recent turns.
    const messages: string[] = (respond.mock.calls.at(-1)?.[0].history ?? []).map(
      (t: { message: string }) => t.message,
    );
    expect(messages).not.toContain('message 0');
    const numbered = messages.filter((m) => /^message \d+$/.test(m)).map((m) => Number(m.split(' ')[1]));
    expect(numbered).toEqual([...numbered].sort((a, b) => a - b));
  });
});

describe('a turn the assistant cannot honour', () => {
  it('records the question even when the assistant throws', async () => {
    // A chat that loses your message when the answer fails is one you stop trusting.
    setChatAssistantModel({
      respond: async () => {
        throw new Error('the model is unavailable');
      },
    });
    const { result, out } = await turn('build me something');
    expect(result.Success).toBe(true);
    expect(String(out('Reply'))).toMatch(/could not answer/i);
    const roles = turns().map((t) => t.fields.Role);
    expect(roles).toEqual(['User', 'Error']);
    // The reason is kept on the row, not just the apology.
    expect(String(turns()[1].fields.Error)).toContain('the model is unavailable');
  });

  it('treats unparseable output as a plain reply rather than an error', async () => {
    assistant('Navy works nicely with off-white.');
    const { out } = await turn('what goes with navy?');
    expect(out('Action')).toBe('none');
    expect(out('Reply')).toBe('Navy works nicely with off-white.');
  });

  it('says so plainly when asked for something not built yet', async () => {
    assistant({ reply: 'I cannot add questions yet — you can add one in the builder.', action: 'unsupported' });
    const { out } = await turn('add a phone number field', { FormID: FORM_ID });
    expect(out('Action')).toBe('unsupported');
    expect(String(out('Reply'))).toMatch(/cannot add questions yet/);
  });
});

describe('a create turn', () => {
  it('runs the generation pipeline and reports the new form', async () => {
    assistant({ reply: 'Building that now.', action: 'create', brief: 'An RSVP with dietary needs.' });
    setFormDesignerModel({
      design: async () =>
        JSON.stringify({ name: 'RSVP', pages: [{ questions: [{ type: 'Email', prompt: 'Email' }] }] }),
    });

    const { out } = await turn('make me an RSVP');

    expect(out('Action')).toBe('create');
    expect(out('FormID')).toBeTruthy();
    expect(saved.some((r) => r.entity === 'MJ_BizApps_Forms: Forms')).toBe(true);
    // The reply carries both the assistant's line and the pipeline's own summary.
    expect(String(out('Reply'))).toContain('Building that now.');
    expect(String(out('Reply'))).toMatch(/Generated draft form/);
  });

  it('moves the thread onto the form it just made', async () => {
    /**
     * THE BUG THIS GUARDS. An author on the forms list asks for a form; it is made and they are
     * carried into it — where the builder looks for that form's thread, finds nothing, and shows
     * an empty box. The exchange that produced the form was filed under the forms-list key, so it
     * only reappeared if they navigated back. It looked like the conversation had been discarded.
     */
    assistant({ reply: 'Building that now.', action: 'create', brief: 'A contact form.' });
    setFormDesignerModel({
      design: async () =>
        JSON.stringify({ name: 'Contact', pages: [{ questions: [{ type: 'Email', prompt: 'Email' }] }] }),
    });

    const { out } = await turn('create a form that collects name, email and address');

    const formId = String(out('FormID'));
    const filings = saved.filter((r) => r.entity === CONVERSATION).map((r) => r.fields.ExternalID);
    expect(filings[0]).toBe('mj-forms:home');
    expect(filings.at(-1)).toBe(chatExternalId(formId));
  });

  it('does not steal the thread of the form the author is already in', async () => {
    /**
     * THE BUG THIS GUARDS. The re-file fired whenever the new form's id differed from the open
     * one — which is always true when a form is created FROM inside the builder. So an author
     * working on form A who said "make me a volunteer form" had A's entire conversation moved
     * onto the brand-new B, and A's chat panel came back empty. The justification for re-filing
     * covers exactly one case, the forms LIST, and that is now the only case it fires in.
     */
    rows.set('MJ_BizApps_Forms: Forms', [{ ID: FORM_ID, Name: 'RSVP', StyleID: null, IsTemplate: 0 }]);
    rows.set('MJ_BizApps_Forms: Form Questions', []);
    assistant({ reply: 'Building that now.', action: 'create', brief: 'A volunteer sign-up.' });
    setFormDesignerModel({
      design: async () =>
        JSON.stringify({ name: 'Volunteers', pages: [{ questions: [{ type: 'Email', prompt: 'Email' }] }] }),
    });

    const { out } = await turn('make me a volunteer form', { FormID: FORM_ID });

    expect(out('FormID')).toBeTruthy();
    const filings = saved.filter((r) => r.entity === CONVERSATION).map((r) => r.fields.ExternalID);
    expect(new Set(filings)).toEqual(new Set([chatExternalId(FORM_ID)]));
  });

  it('leaves the thread where it is when the turn made no form', async () => {
    assistant({ reply: 'Building that now.', action: 'create', brief: 'something' });
    setFormDesignerModel({ design: async () => 'not a blueprint' });
    await turn('make me a form');
    const filings = saved.filter((r) => r.entity === CONVERSATION).map((r) => r.fields.ExternalID);
    expect(new Set(filings)).toEqual(new Set(['mj-forms:home']));
  });

  it('tells the author in the thread when generation fails', async () => {
    assistant({ reply: 'Building that now.', action: 'create', brief: 'something' });
    setFormDesignerModel({ design: async () => 'not a blueprint' });

    const { out } = await turn('make me a form');

    expect(String(out('Reply'))).toMatch(/didn't work/i);
    expect(out('FormID')).toBeUndefined();
  });
});

describe('a restyle turn', () => {
  beforeEach(() => {
    // A form with a style to edit, as the builder would have left it.
    rows.set('MJ_BizApps_Forms: Forms', [{ ID: FORM_ID, Name: 'RSVP', StyleID: STYLE_ID, IsTemplate: 0 }]);
    rows.set(STYLE, [{ ID: STYLE_ID, Name: 'RSVP theme', CSSVariables: '{}' }]);
    rows.set('MJ_BizApps_Forms: Form Questions', []);
  });

  it('applies the palette through the same gate a generated theme takes', async () => {
    assistant({
      reply: 'Made the buttons green.',
      action: 'restyle',
      cssVariables: { '--mjf-accent': '#0a7d3f', '--mjf-invented': 'nope' },
    });

    const { out } = await turn('make the buttons green', { FormID: FORM_ID });

    expect(out('Action')).toBe('restyle');
    expect(out('StyleID')).toBe(STYLE_ID);
    const written = JSON.parse(String(saved.filter((r) => r.entity === STYLE).at(-1)?.fields.CSSVariables));
    expect(written['--mjf-accent']).toBe('#0a7d3f');
    // Unknown token stripped, and the house layout tokens survived the merge.
    expect(written['--mjf-invented']).toBeUndefined();
    expect(written['--mjf-btn-radius']).toBe('999px');
    expect(written['--mjf-title-align']).toBe('center');
  });

  it('KEEPS the sizing and alignment the author set in the Design tab', async () => {
    // The assertions above fixture the palette as `{}`, so the house defaults are the only values
    // available and they pass whether the code preserves the author's tokens or discards them.
    // This is the case that separates the two: the author has already squared off the buttons and
    // left-aligned the title, and asks only for a colour.
    rows.set(STYLE, [{
      ID: STYLE_ID, Name: 'RSVP theme',
      CSSVariables: JSON.stringify({
        '--mjf-btn-radius': '4px',
        '--mjf-title-align': 'left',
        '--mjf-question-size': '0.875rem',
        '--mjf-accent': '#1b7fa8',
      }),
    }]);
    assistant({ reply: 'Warmed it up.', action: 'restyle', cssVariables: { '--mjf-accent': '#c2410c' } });

    await turn('make it warmer', { FormID: FORM_ID });

    const written = JSON.parse(String(saved.filter((r) => r.entity === STYLE).at(-1)?.fields.CSSVariables));
    expect(written['--mjf-accent']).toBe('#c2410c');
    expect(written['--mjf-btn-radius']).toBe('4px');
    expect(written['--mjf-title-align']).toBe('left');
    expect(written['--mjf-question-size']).toBe('0.875rem');
  });

  it('warns in the reply when the palette cannot carry readable text', async () => {
    assistant({
      reply: 'Done.',
      action: 'restyle',
      cssVariables: { '--mjf-page-bg': '#777777', '--mjf-page-ink': '#7a7a7a' },
    });
    const { out } = await turn('make it grey', { FormID: FORM_ID });
    expect(String(out('Reply'))).toMatch(/hard to read/i);
  });

  it('explains itself rather than failing when no form is open', async () => {
    assistant({ reply: 'Sure.', action: 'restyle', cssVariables: { '--mjf-accent': '#0a7d3f' } });
    const { result, out } = await turn('make the buttons green');
    expect(result.Success).toBe(true);
    expect(String(out('Reply'))).toMatch(/open a form first/i);
  });

  it('gives the assistant the form on screen to talk about', async () => {
    // The context is the SNAPSHOT now — a rendered description carrying handles, plus the
    // structure those handles resolve against. It used to be a bare list of `[type] prompt`
    // strings, which is enough to discuss a form and not enough to change one.
    const page = 'cccccccc-dddd-4eee-8fff-111111111111';
    rows.set('MJ_BizApps_Forms: Form Pages', [
      { ID: page, FormID: FORM_ID, Title: 'Details', DisplayOrder: 0 },
    ]);
    rows.set('MJ_BizApps_Forms: Form Questions', [
      { ID: 'dddddddd-eeee-4fff-8aaa-222222222222', FormID: FORM_ID, PageID: page, QuestionType: 'Email', Prompt: 'Your email', DisplayOrder: 0, IsRequired: false },
    ]);
    const respond = assistant({ reply: 'ok', action: 'none' });
    await turn('what do you think?', { FormID: FORM_ID });
    const context = respond.mock.calls.at(-1)?.[0].context;
    expect(context?.name).toBe('RSVP');
    expect(context?.description).toContain('[Email] Your email');
    expect(context?.description).toContain('q1');
    expect(context?.snapshot.pages[0].questions[0].handle).toBe('q1');
  });
});

describe('an image turn', () => {
  const PROMPT = 'a sunlit conference hall with rows of empty chairs';

  beforeEach(() => {
    rows.set('MJ_BizApps_Forms: Forms', [{ ID: FORM_ID, Name: 'RSVP', StyleID: null, IsTemplate: 0 }]);
    rows.set('MJ_BizApps_Forms: Form Questions', []);
    rows.set(SCREEN, [
      { ID: SCREEN_ID, FormID: FORM_ID, ScreenType: 'Welcome', DisplayOrder: 1, MediaURL: null },
    ]);
    setChatImageModel({
      generate: async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' }),
    });
    setGeneratedImageStore({
      store: async () => ({ url: 'https://assets.example/forms/hall.png' }),
    });
  });

  it('puts the picture on the welcome screen and reports where it went', async () => {
    assistant({ reply: 'Adding a conference hall to the start screen.', action: 'image', imagePrompt: PROMPT });

    const { out } = await turn('add a picture of a conference hall', { FormID: FORM_ID });

    expect(out('Action')).toBe('image');
    expect(out('ScreenID')).toBe(SCREEN_ID);
    expect(out('ImageURL')).toBe('https://assets.example/forms/hall.png');
    const written = saved.filter((r) => r.entity === SCREEN).at(-1);
    expect(written?.fields.MediaURL).toBe('https://assets.example/forms/hall.png');
    // The reply is the assistant's own line; nothing is appended when it worked.
    expect(out('Reply')).toBe('Adding a conference hall to the start screen.');
  });

  it('sends the picture the assistant described, not the author\'s words', async () => {
    // The seam matters: the author says "something conference-y", the assistant turns that into a
    // description an image model can actually draw, and THAT is what gets generated.
    const generate = vi.fn(async () => ({ bytes: new Uint8Array([1]), contentType: 'image/png' }));
    setChatImageModel({ generate });
    assistant({ reply: 'On it.', action: 'image', imagePrompt: PROMPT });

    await turn('something conference-y on the front', { FormID: FORM_ID });

    expect(generate.mock.calls[0][0]).toBe(PROMPT);
  });

  it('targets the ending screen when that is what was asked for', async () => {
    const endingId = 'cccccccc-dddd-4eee-8fff-000000000000';
    rows.get(SCREEN)?.push({
      ID: endingId,
      FormID: FORM_ID,
      ScreenType: 'Ending',
      DisplayOrder: 1,
      MediaURL: null,
    });
    assistant({ reply: 'Done.', action: 'image', imagePrompt: PROMPT, imageTarget: 'ending' });

    const { out } = await turn('put a photo on the thank-you screen', { FormID: FORM_ID });

    expect(out('ScreenID')).toBe(endingId);
  });

  it('says which screen is missing rather than failing silently', async () => {
    rows.set(SCREEN, []);
    assistant({ reply: 'Sure.', action: 'image', imagePrompt: PROMPT });
    const { result, out } = await turn('add a picture', { FormID: FORM_ID });
    expect(result.Success).toBe(true);
    expect(String(out('Reply'))).toMatch(/no welcome screen yet/i);
    expect(out('ImageURL')).toBeUndefined();
  });

  it('names the reason when the instance has no image store', async () => {
    // Degraded, not swallowed: "nobody configured storage" is something the author can escalate,
    // and a picture that never appears with no explanation is the failure this replaces.
    resetGeneratedImageStore();
    assistant({ reply: 'Sure.', action: 'image', imagePrompt: PROMPT });
    const { out } = await turn('add a picture', { FormID: FORM_ID });
    expect(String(out('Reply'))).toMatch(/no store configured/i);
    expect(saved.some((r) => r.entity === SCREEN)).toBe(false);
  });

  it('tells the author what the image model actually said', async () => {
    /**
     * THE BUG THIS GUARDS, found by the smoke test on its first real run. The reply carried the
     * degradation MARKER — "I could not add that: the welcome screen" — which names the target and
     * nothing the author or an operator could act on. The cause ("No API key found for
     * OpenAIImageGenerator") existed only in the server log.
     */
    setChatImageModel({
      generate: async () => {
        throw new Error('No API key found for OpenAIImageGenerator or vendor OpenAI');
      },
    });
    assistant({ reply: 'On it.', action: 'image', imagePrompt: PROMPT });

    const { out } = await turn('add a picture', { FormID: FORM_ID });

    expect(String(out('Reply'))).toContain('No API key found for OpenAIImageGenerator');
    // And it does NOT just echo the target back, which is what it used to do.
    expect(String(out('Reply'))).not.toMatch(/could not add that:\*\* the welcome screen\.?$/);
  });

  it('explains itself rather than failing when no form is open', async () => {
    assistant({ reply: 'Sure.', action: 'image', imagePrompt: PROMPT });
    const { result, out } = await turn('add a picture');
    expect(result.Success).toBe(true);
    expect(String(out('Reply'))).toMatch(/open a form first/i);
  });

  it('does not reach a screen lookup with an injected form id', async () => {
    assistant({ reply: 'Sure.', action: 'image', imagePrompt: PROMPT });
    const { out } = await turn('add a picture', { FormID: "x' OR '1'='1" });
    expect(String(out('Reply'))).toMatch(/open a form first/i);
    expect(saved.some((r) => r.entity === SCREEN)).toBe(false);
  });
});

describe('ids that reach a SQL filter', () => {
  /**
   * THE BUG THIS GUARDS, which a security review caught after it was already written twice
   * elsewhere and fixed twice.
   *
   * `FormID` arrives from a client-supplied action param and was interpolated straight into a
   * `RunView.ExtraFilter`. A value of `x' OR '1'='1` produced
   *
   *     UserID='<caller>' AND ExternalID='mj-forms:form:x' OR '1'='1' AND IsArchived = 0
   *
   * and SQL binds AND tighter than OR, so that reads as "(mine) OR (every unarchived
   * conversation)". The caller's own user id — the thing that looked like the access control —
   * was bypassed, and the chat would then have loaded another user's thread and handed it to the
   * assistant. Cross-user disclosure from one query parameter.
   */
  const INJECTION = "x' OR '1'='1";

  it('never lets an injected form id reach the filter', async () => {
    await turn('hello', { FormID: INJECTION });
    const conversation = saved.find((r) => r.entity === CONVERSATION);
    // Collapsed to the forms-list thread rather than embedded. The quote is nowhere.
    expect(conversation?.fields.ExternalID).toBe('mj-forms:home');
    expect(String(conversation?.fields.ExternalID)).not.toContain("'");
  });

  it('starts a fresh thread rather than building a query from an injected conversation id', async () => {
    /**
     * Named for what it actually proves. A client `ConversationID` reaches a PARAMETERISED
     * `Load`, never an interpolated filter — the only filter carrying a conversation id is
     * `loadChatHistory`'s, and that id comes from a row already loaded. So this test passes with
     * `isGuid` neutered, and that is correct rather than weak: the structural property holds
     * without the guard.
     *
     * It was previously titled as an injection guard, which claimed evidence it does not provide.
     * The guard that DOES matter for this parameter is ownership, tested in its own block above.
     */
    await turn('hello', { ConversationID: INJECTION });
    expect(saved.filter((r) => r.entity === CONVERSATION)).toHaveLength(1);
    expect(String(saved[0].fields.ExternalID)).not.toContain("'");
    expect(seenFilters.join(' | ')).not.toContain("OR '1'='1");
  });

  it('treats a malformed id as absent rather than failing the message', async () => {
    // A DEGRADATION test, not a guard test — it passes with or without `isGuid` and is not
    // evidence the guard works. It is here because the guard's chosen failure mode is a design
    // decision worth pinning: a bad id means the same thing as an id naming something that does
    // not exist, and erroring would be a failure the author cannot act on.
    assistant({ reply: 'Sure.', action: 'none' });
    const { result, out } = await turn('what goes with navy?', { FormID: INJECTION });
    expect(result.Success).toBe(true);
    expect(out('Reply')).toBe('Sure.');
  });

  it('does not describe a form for an injected id', async () => {
    rows.set('MJ_BizApps_Forms: Forms', [{ ID: FORM_ID, Name: 'RSVP', StyleID: null, IsTemplate: 0 }]);
    const respond = assistant({ reply: 'ok', action: 'none' });
    await turn('tell me about this form', { FormID: INJECTION });
    // No context at all — the lookup never ran.
    expect(respond.mock.calls.at(-1)?.[0].context).toBeUndefined();
    // Asserted on the QUERIES, not just the outcome: an injected id names no row either way, so
    // "context is undefined" alone is true with the guard removed.
    expect(seenFilters.some((f) => f.includes(INJECTION))).toBe(false);
  });

  it('still works normally for a real GUID', async () => {
    // The guard must not break the happy path it is protecting.
    const realId = '11111111-2222-4333-8444-555555555555';
    await turn('hello', { FormID: realId });
    expect(saved.find((r) => r.entity === CONVERSATION)?.fields.ExternalID).toBe(
      `mj-forms:form:${realId}`,
    );
  });
});

describe('listing and opening forms', () => {
  beforeEach(() => {
    rows.set('MJ_BizApps_Forms: Forms', [
      { ID: FORM_ID, Name: 'Assessment', Status: 'Draft', StyleID: null, IsArchived: false },
      { ID: '99999999-8888-4777-8666-555555555555', Name: 'Event RSVP', Status: 'Published', StyleID: null, IsArchived: false },
    ]);
  });

  it('tells the assistant which forms exist, by handle', async () => {
    const respond = assistant({ reply: 'ok', action: 'none' });
    await turn('what forms do I have?');
    const forms = respond.mock.calls.at(-1)?.[0].forms;
    expect(forms).toContain('Assessment');
    expect(forms).toContain('Event RSVP');
    expect(forms).toMatch(/f1|f2/);
  });

  it('never shows the assistant a raw form id', async () => {
    // Same reason questions get handles: an id the model can see is an id it can guess at.
    const respond = assistant({ reply: 'ok', action: 'none' });
    await turn('what forms do I have?');
    expect(respond.mock.calls.at(-1)?.[0].forms).not.toContain(FORM_ID);
  });

  it('turns a handle into the id the client navigates to', async () => {
    // Handles follow the LIST's order, and `loadFormList` reads `__mj_UpdatedAt DESC` — so the
    // most recently touched form is f1 and the row inserted first is f2. This used to expect the
    // opposite because the fake ignored OrderBy and handed rows back in insertion order; it now
    // honours it, which is what makes the history-window test able to fail.
    assistant({ reply: 'Opening Assessment.', action: 'open', openFormId: 'f2' });
    const { out } = await turn('open my other form');
    expect(out('Action')).toBe('open');
    expect(out('OpenFormID')).toBe(FORM_ID);
  });

  it('says so when the handle names no form of theirs', async () => {
    assistant({ reply: 'Opening it.', action: 'open', openFormId: 'f9' });
    const { result, out } = await turn('open my budget form');
    expect(result.Success).toBe(true);
    expect(out('OpenFormID')).toBeUndefined();
    expect(String(out('Reply'))).toMatch(/could not/i);
  });

  it('opening writes nothing to any form', async () => {
    // Navigation only. The scope decision is that every WRITE lands on what is on screen, so this
    // path must not be a way to reach a form the author is not looking at.
    assistant({ reply: 'Opening it.', action: 'open', openFormId: 'f2' });
    await turn('open my RSVP');
    expect(saved.filter((r) => r.entity.startsWith('MJ_BizApps_Forms:'))).toEqual([]);
  });
});

describe('what the thread records', () => {
  it('stores the reply the author saw, refusals and all — not the model\'s optimistic one', async () => {
    // The model writes its reply before anything is attempted, so on a refused operation it reads
    // "Added a matrix question" while the form got nothing. Persisting THAT made the transcript
    // disagree with the form — and the transcript is the next turn's history, so the model would
    // go on reasoning about a question that does not exist.
    assistant({
      reply: 'Added a matrix question.',
      action: 'edit',
      operations: [{ op: 'addQuestion', handle: 'p1', type: 'Matrix', prompt: 'Rate these', options: ['Poor', 'Good'] }],
    });

    const { out } = await turn('add a matrix', { FormID: FORM_ID });

    const recorded = saved
      .filter((r) => r.entity === 'MJ: Conversation Details' && r.fields.Role === 'AI')
      .at(-1);
    expect(String(recorded?.fields.Message)).toMatch(/could not/i);
    expect(String(recorded?.fields.Message)).toBe(String(out('Reply')));
  });
});

describe('an edit turn', () => {
  const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const Q1 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

  beforeEach(() => {
    rows.set('MJ_BizApps_Forms: Forms', [{ ID: FORM_ID, Name: 'Assessment', Status: 'Draft', StyleID: null, IsTemplate: 0 }]);
    rows.set('MJ_BizApps_Forms: Form Pages', [{ ID: PAGE, FormID: FORM_ID, Title: 'Details', DisplayOrder: 0 }]);
    rows.set('MJ_BizApps_Forms: Form Questions', [
      { ID: Q1, FormID: FORM_ID, PageID: PAGE, QuestionType: 'ShortText', Prompt: 'Your name', DisplayOrder: 0, IsRequired: false },
    ]);
    rows.set('MJ_BizApps_Forms: Form Question Options', []);
    rows.set('MJ_BizApps_Forms: Form Screens', []);
    rows.set('MJ_BizApps_Forms: Form Responses', []);
    rows.set('MJ_BizApps_Forms: Form Response Answers', []);
  });

  it('names the style row when the edit changed layout, so the change can be undone', async () => {
    // `setLayout` merges into the same `CSSVariables` field on the same row a restyle replaces, so
    // it is exactly as undoable — but the turn reported only `ChangedFormID`, and the undo path
    // keys on `StyleID`. "Make the questions smaller" was the one theme change with no way back.
    const STYLE_ROW = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
    rows.set('MJ_BizApps_Forms: Forms', [{ ID: FORM_ID, Name: 'Assessment', Status: 'Draft', StyleID: STYLE_ROW, IsTemplate: 0 }]);
    rows.set(STYLE, [
      { ID: STYLE_ROW, Name: 'theme', CSSVariables: JSON.stringify({ '--mjf-accent': '#1b7fa8' }) },
    ]);
    assistant({
      reply: 'Made the questions smaller.',
      action: 'edit',
      operations: [{ op: 'setLayout', tokens: { '--mjf-question-size': '0.875rem' } }],
    });

    const { out } = await turn('make the questions smaller', { FormID: FORM_ID });

    expect(out('ChangedFormID')).toBe(FORM_ID);
    expect(out('StyleID')).toBe(STYLE_ROW);
    // And the palette is untouched, which is the whole reason setLayout is its own operation.
    const written = JSON.parse(String(saved.filter((r) => r.entity === STYLE).at(-1)?.fields.CSSVariables));
    expect(written['--mjf-question-size']).toBe('0.875rem');
    expect(written['--mjf-accent']).toBe('#1b7fa8');
  });

  it('does not name a style row when the edit changed no layout', async () => {
    // The form MUST have a style for this to mean anything. With `StyleID: null` the answer is
    // undefined whether the gate works or not, so the assertion passed with the gate removed —
    // it asserted the fixture, not the behaviour.
    const STYLE_ROW = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
    rows.set('MJ_BizApps_Forms: Forms', [{ ID: FORM_ID, Name: 'Assessment', Status: 'Draft', StyleID: STYLE_ROW, IsTemplate: 0 }]);
    rows.set(STYLE, [{ ID: STYLE_ROW, Name: 'theme', CSSVariables: '{}' }]);
    assistant({
      reply: 'Renamed the page.',
      action: 'edit',
      operations: [{ op: 'updatePage', handle: 'p1', title: 'About you' }],
    });

    const { out } = await turn('rename the page', { FormID: FORM_ID });

    expect(out('ChangedFormID')).toBe(FORM_ID);
    expect(out('StyleID')).toBeUndefined();
  });

  it('adds the question the author asked for', async () => {
    assistant({
      reply: 'Added a rating question.',
      action: 'edit',
      operations: [{ op: 'addQuestion', handle: 'p1', type: 'Rating', prompt: 'How likely to recommend?' }],
    });

    const { result, out } = await turn('add a rating question', { FormID: FORM_ID });

    expect(result.Success).toBe(true);
    expect(out('Action')).toBe('edit');
    const added = saved.filter((r) => r.entity === 'MJ_BizApps_Forms: Form Questions').at(-1);
    expect(added?.fields.Prompt).toBe('How likely to recommend?');
    expect(added?.fields.QuestionType).toBe('Rating');
  });

  it('tells the author what it changed, in the reply', async () => {
    assistant({
      reply: 'Done.',
      action: 'edit',
      operations: [{ op: 'updateQuestion', handle: 'q1', prompt: 'What is your full name?' }],
    });
    const { out } = await turn('reword the name question', { FormID: FORM_ID });
    expect(String(out('Reply'))).toContain('full name');
  });

  it('carries a refusal into the reply rather than failing the turn', async () => {
    assistant({
      reply: 'Removing it.',
      action: 'edit',
      operations: [{ op: 'deleteQuestion', handle: 'q9' }],
    });
    const { result, out } = await turn('drop the phone question', { FormID: FORM_ID });
    expect(result.Success).toBe(true);
    expect(String(out('Reply'))).toContain('q9');
  });

  it('shows the assistant the form with handles it can point at', async () => {
    const respond = assistant({ reply: 'ok', action: 'none' });
    await turn('what is on this form?', { FormID: FORM_ID });
    const context = respond.mock.calls.at(-1)?.[0].context;
    expect(context?.description).toContain('q1');
    expect(context?.description).toContain('Your name');
  });

  it('will not edit when no form is open', async () => {
    assistant({
      reply: 'Sure.',
      action: 'edit',
      operations: [{ op: 'updateQuestion', handle: 'q1', prompt: 'x' }],
    });
    const { result, out } = await turn('reword it');
    expect(result.Success).toBe(true);
    expect(String(out('Reply'))).toMatch(/open a form first/i);
  });
});

describe('an action declared without the payload it needs', () => {
  /**
   * THE BUG THIS GUARDS. Dispatch was three guards of the form
   * `action === 'create' && response.brief`, each falling through to `return { reply }` when the
   * payload was missing. So a model answering
   *
   *     {"reply": "Done — I've built your RSVP form.", "action": "create"}
   *
   * built nothing, logged nothing, set `Action` to `create`, and handed the author a sentence
   * saying their form existed. A change that silently does not happen is the worst outcome
   * available — worse than an error, because nothing tells anyone to look.
   *
   * `restyle` had a second edge: the guard was truthiness and `{}` is truthy, so an empty token
   * map passed it and reset the whole theme to house default.
   */
  beforeEach(() => {
    rows.set('MJ_BizApps_Forms: Forms', [{ ID: FORM_ID, Name: 'RSVP', StyleID: STYLE_ID, IsTemplate: 0 }]);
    rows.set(STYLE, [{ ID: STYLE_ID, Name: 'RSVP theme', CSSVariables: '{}' }]);
    rows.set('MJ_BizApps_Forms: Form Questions', []);
  });

  it('does not claim a form was built when no brief arrived', async () => {
    assistant({ reply: "Done — I've built your RSVP form.", action: 'create' });
    const { out } = await turn('build me an RSVP');
    expect(out('FormID')).toBeUndefined();
    expect(saved.some((r) => r.entity === 'MJ_BizApps_Forms: Forms')).toBe(false);
    expect(String(out('Reply'))).toMatch(/could not/i);
  });

  it('does not reset the theme when the token map is empty', async () => {
    assistant({ reply: 'Made it warmer.', action: 'restyle', cssVariables: {} });
    const { out } = await turn('make it warmer', { FormID: FORM_ID });
    expect(saved.some((r) => r.entity === STYLE)).toBe(false);
    expect(String(out('Reply'))).toMatch(/could not/i);
  });

  it('does not claim a picture was added when no description arrived', async () => {
    assistant({ reply: 'Added a photo to the start screen.', action: 'image' });
    const { out } = await turn('add a picture', { FormID: FORM_ID });
    expect(out('ImageURL')).toBeUndefined();
    expect(String(out('Reply'))).toMatch(/could not/i);
  });

  it('leaves a reply-only turn alone', async () => {
    // `none` and `unsupported` carry no payload by design, so nothing here may touch them.
    assistant({ reply: 'Navy pairs well with off-white.', action: 'none' });
    const { out } = await turn('what goes with navy?');
    expect(out('Reply')).toBe('Navy pairs well with off-white.');
  });
});

describe('a conversation read that fails', () => {
  it('does not silently start a new thread, losing the one that exists', async () => {
    // Falling through to "create" on a FAILED read is the worst of both: the author's history
    // disappears mid-conversation with nothing logged, AND a duplicate Conversation row is minted
    // that the next lookup has to disambiguate. An empty read means no thread; a failed read means
    // we do not know.
    assistant({ reply: 'ok', action: 'none' });
    viewFailsFor = 'MJ: Conversations';

    // It throws, and `InternalRunAction` turns that into a failed action result for the client.
    // What this pins is the part that outlives the turn: no thread was forked.
    await expect(turn('what can you do?')).rejects.toThrow(/could not open this conversation/i);

    expect(saved.filter((r) => r.entity === 'MJ: Conversations')).toHaveLength(0);
  });
});

describe('a conversation id that belongs to somebody else', () => {
  /**
   * THE BUG THIS GUARDS. `ConversationID` is a declared, client-supplied action input, and the
   * branch that honours it called `Load(id)` and returned the row — no ownership check at all —
   * while the sibling lookup eleven lines below it filters on `UserID`. `guidOrUndefined` made a
   * foreign id injection-SAFE, which is a different property from authorized, and the gap was easy
   * to miss precisely because the guard next to it looked like the guard.
   *
   * Read AND write: `loadChatHistory` would have fed the victim's last ten turns to the model, and
   * `appendTurn` would then have written the caller\'s message into the victim's thread.
   */
  const OTHER_USER_THREAD = 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb';

  beforeEach(() => {
    rows.set(CONVERSATION, [
      {
        ID: OTHER_USER_THREAD,
        UserID: 'somebody-else',
        ExternalID: 'mj-forms:home',
        Name: 'Their private thread',
        IsArchived: false,
      },
    ]);
  });

  it('does not adopt it', async () => {
    const { out } = await turn('what were we saying?', { ConversationID: OTHER_USER_THREAD });
    expect(out('ConversationID')).not.toBe(OTHER_USER_THREAD);
  });

  it('does not read their turns into the prompt', async () => {
    rows.set(DETAIL, [
      {
        ID: 'their-turn',
        ConversationID: OTHER_USER_THREAD,
        Role: 'User',
        Message: 'my salary is confidential',
        HiddenToUser: false,
      },
    ]);
    const respond = assistant({ reply: 'ok', action: 'none' });
    await turn('what were we saying?', { ConversationID: OTHER_USER_THREAD });
    const history = respond.mock.calls.at(-1)?.[0].history ?? [];
    expect(JSON.stringify(history)).not.toContain('confidential');
  });

  it('does not write into their thread', async () => {
    await turn('hello', { ConversationID: OTHER_USER_THREAD });
    const written = turns().map((t) => t.fields.ConversationID);
    expect(written).not.toContain(OTHER_USER_THREAD);
  });

  it('still adopts the caller\'s own thread', async () => {
    // The guard must not break the path it is protecting.
    const mine = 'eeeeeeee-ffff-4aaa-8bbb-cccccccccccc';
    rows.set(CONVERSATION, [
      { ID: mine, UserID: user.ID, ExternalID: 'mj-forms:home', Name: 'Mine', IsArchived: false },
    ]);
    const { out } = await turn('carry on', { ConversationID: mine });
    expect(out('ConversationID')).toBe(mine);
  });
});

describe('chatExternalId — the last line, tested on its own', () => {
  /**
   * Tested DIRECTLY because three layers guard this value, so removing any one of them leaves the
   * end-to-end test still passing. That is defence in depth working, and it is also how a layer
   * quietly stops being load-bearing without anything noticing. This one builds the string that
   * lands in the filter, so it gets its own assertion.
   */
  it('embeds a real GUID', () => {
    expect(chatExternalId(FORM_ID)).toBe(`mj-forms:form:${FORM_ID}`);
  });

  it('collapses anything that is not a GUID to the forms-list thread', () => {
    for (const attempt of ["x' OR '1'='1", "'; DROP TABLE x;--", 'not-a-guid', '']) {
      expect(chatExternalId(attempt), attempt).toBe('mj-forms:home');
    }
    expect(chatExternalId(undefined)).toBe('mj-forms:home');
  });

  it('never returns a string containing a quote', () => {
    // The property the surrounding SQL literal depends on.
    for (const attempt of [FORM_ID, "x' OR '1'='1", "''", undefined]) {
      expect(chatExternalId(attempt)).not.toContain("'");
    }
  });
});
