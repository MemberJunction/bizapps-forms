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
    const num = /^(\w+)\s*=\s*(\d+)$/.exec(clause);
    if (num) return String(row[num[1]] ?? '') === String(Boolean(Number(num[2])));
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
    async RunView(params: { EntityName: string; ExtraFilter?: string }): Promise<{
      Success: boolean;
      Results: unknown[];
    }> {
      const table = rows.get(params.EntityName) ?? [];
      return { Success: true, Results: table.filter((r) => matchesFilter(r, params.ExtraFilter)) };
    }
  },
  UserInfo: class {
    ID = 'user-1';
  },
}));

import { UserInfo } from '@memberjunction/core';
import { runChatTurn, setChatAssistantModel } from './chat.action';
import { setStagedAuthoringModel, setFormDesignerModel } from './generate-form.action';
import { chatExternalId, MAX_CHAT_HISTORY_TURNS } from './chat-assistant';
import type { FormChatResponse } from '@mj-biz-apps/forms-entities';

const CONVERSATION = 'MJ: Conversations';
const DETAIL = 'MJ: Conversation Details';
const STYLE = 'MJ_BizApps_Forms: Form Styles';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await runChatTurn(message, params as any, user);
  const out = (name: string): unknown => params.Params.find((p) => p.Name === name)?.Value;
  return { result, out, params };
}

const turns = (): SavedRow[] => saved.filter((r) => r.entity === DETAIL);

beforeEach(() => {
  saved.length = 0;
  rows.clear();
  minted = 0;
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
    await turn('hello', { FormID: 'form-9' });
    const conversations = saved.filter((r) => r.entity === CONVERSATION);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].fields.ExternalID).toBe(chatExternalId('form-9'));

    saved.length = 0;
    await turn('hello again', { FormID: 'form-9' });
    // No second conversation row: the existing thread was found by its ExternalID.
    expect(saved.filter((r) => r.entity === CONVERSATION)).toHaveLength(0);
  });

  it('keeps a form thread separate from the forms-list thread', async () => {
    await turn('about this form', { FormID: 'form-9' });
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
    const { out } = await turn('add a phone number field', { FormID: 'form-9' });
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
    rows.set('MJ_BizApps_Forms: Forms', [{ ID: 'form-9', Name: 'RSVP', StyleID: 'style-9' }]);
    rows.set(STYLE, [{ ID: 'style-9', Name: 'RSVP theme', CSSVariables: '{}' }]);
    rows.set('MJ_BizApps_Forms: Form Questions', []);
  });

  it('applies the palette through the same gate a generated theme takes', async () => {
    assistant({
      reply: 'Made the buttons green.',
      action: 'restyle',
      cssVariables: { '--mjf-accent': '#0a7d3f', '--mjf-invented': 'nope' },
    });

    const { out } = await turn('make the buttons green', { FormID: 'form-9' });

    expect(out('Action')).toBe('restyle');
    expect(out('StyleID')).toBe('style-9');
    const written = JSON.parse(String(saved.filter((r) => r.entity === STYLE).at(-1)?.fields.CSSVariables));
    expect(written['--mjf-accent']).toBe('#0a7d3f');
    // Unknown token stripped, and the house layout tokens survived the merge.
    expect(written['--mjf-invented']).toBeUndefined();
    expect(written['--mjf-btn-radius']).toBe('999px');
    expect(written['--mjf-title-align']).toBe('center');
  });

  it('warns in the reply when the palette cannot carry readable text', async () => {
    assistant({
      reply: 'Done.',
      action: 'restyle',
      cssVariables: { '--mjf-page-bg': '#777777', '--mjf-page-ink': '#7a7a7a' },
    });
    const { out } = await turn('make it grey', { FormID: 'form-9' });
    expect(String(out('Reply'))).toMatch(/hard to read/i);
  });

  it('explains itself rather than failing when no form is open', async () => {
    assistant({ reply: 'Sure.', action: 'restyle', cssVariables: { '--mjf-accent': '#0a7d3f' } });
    const { result, out } = await turn('make the buttons green');
    expect(result.Success).toBe(true);
    expect(String(out('Reply'))).toMatch(/open a form first/i);
  });

  it('gives the assistant the form on screen to talk about', async () => {
    rows.set('MJ_BizApps_Forms: Form Questions', [
      { ID: 'q1', FormID: 'form-9', QuestionType: 'Email', Prompt: 'Your email' },
    ]);
    const respond = assistant({ reply: 'ok', action: 'none' });
    await turn('what do you think?', { FormID: 'form-9' });
    const context = respond.mock.calls.at(-1)?.[0].context;
    expect(context?.name).toBe('RSVP');
    expect(context?.questions).toContain('[Email] Your email');
  });
});
