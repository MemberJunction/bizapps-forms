import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The staged pipeline, driven entirely offline: a stub model, a stub publisher, a fake entity
 * layer. No network, no API key, no websocket, no database.
 *
 * That is the whole reason both stages return raw text through a seam. The things worth proving
 * here — the exact event sequence, that a failed page degrades instead of failing the run, that a
 * degradation is NAMED rather than counted, that concurrency is actually bounded — are all
 * sequencing properties, and sequencing is exactly what an integration test makes hardest to see.
 */
interface SavedRow {
  entity: string;
  fields: Record<string, unknown>;
}

const saved: SavedRow[] = [];

/**
 * The fake database's current rows, by entity name.
 *
 * Written by `Save()` and read by `RunView`, so the outline's questions ARE the stubs the detail
 * pass reads back. That coherence is the point: hand-staging a separate stub list made the
 * key-to-id map the pipeline built disagree with the rows the fake returned — a disagreement the
 * real system cannot have, and one that hid a genuine reordering bug behind a fixture incapable of
 * reproducing it.
 */
const rows = new Map<string, Array<Record<string, unknown>>>();

/** Entities whose saves the fake keeps, because something later reads them back. */
const READ_BACK_ENTITIES = new Set([
  'MJ_BizApps_Forms: Form Questions',
  'MJ_BizApps_Forms: Form Question Options',
]);

class FakeEntity {
  ID = '';
  constructor(private readonly entityName: string) {}
  get LatestResult(): { Message: string; CompleteMessage: string } {
    return { Message: 'forced failure', CompleteMessage: 'forced failure' };
  }
  NewRecord(): void {}
  /** The media and theme write-backs load an existing row before editing it. */
  async Load(id: string): Promise<boolean> {
    this.ID = id;
    return true;
  }
  async Save(): Promise<boolean> {
    const isNew = !this.ID;
    if (isNew) {
      // A real GUID shape, because the Builder now refuses to interpolate anything else into a
      // filter — and a fake that mints ids the production code would reject is a fake that
      // cannot exercise the path it is standing in for.
      this.ID = fakeGuid(saved.length + 1);
    }
    saved.push({ entity: this.entityName, fields: snapshot(this) });
    if (isNew && READ_BACK_ENTITIES.has(this.entityName)) {
      const table = rows.get(this.entityName) ?? [];
      table.push(this as unknown as Record<string, unknown>);
      rows.set(this.entityName, table);
    }
    return true;
  }
}

/**
 * A deterministic GUID for the fake's rows.
 *
 * Deterministic rather than random so a failing assertion names the same id twice in a row, and
 * genuinely GUID-shaped so it survives the Builder's injection guard.
 */
function fakeGuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function snapshot(entity: FakeEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (key !== 'entityName') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Enough `ExtraFilter` understanding to keep one page's rows out of another page's read.
 *
 * Only the two shapes the Builder actually emits — `PageID='x'` and `QuestionID IN ('a','b')`.
 * A fake that ignored filters handed page 1's options to page 2, which made page 2 skip its own
 * option creation and quietly turned every multi-page test into a single-page one. It throws on
 * anything else rather than silently matching everything.
 */
function matchesFilter(row: Record<string, unknown>, filter: string | undefined): boolean {
  if (!filter) {
    return true;
  }
  const equals = /^(\w+)='([^']*)'$/.exec(filter.trim());
  if (equals) {
    return row[equals[1]] === equals[2];
  }
  const inList = /^(\w+) IN \(([^)]*)\)$/.exec(filter.trim());
  if (inList) {
    const allowed = new Set([...inList[2].matchAll(/'([^']*)'/g)].map((m) => m[1]));
    return allowed.has(String(row[inList[1]]));
  }
  throw new Error(`The fake RunView does not understand this filter: ${filter}`);
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
  UserInfo: class {},
}));

// Import AFTER the mock is registered.
import { UserInfo } from '@memberjunction/core';
import { runStagedAuthoring, shouldStage, type StagedAuthoringModel } from './staged-authoring';
import {
  resetFormsProgressPublisher,
  setFormsProgressPublisher,
  type GenerateFormProgressEvent,
} from './progress-events';
import { PAGE_DETAIL_CONCURRENCY, MAX_DESIGNER_ATTEMPTS, MAX_GENERATED_IMAGES } from './limits';
import { resetGeneratedImageStore, setGeneratedImageStore } from './generated-image-store';

const ENTITY_NAME = {
  option: 'MJ_BizApps_Forms: Form Question Options',
  screen: 'MJ_BizApps_Forms: Form Screens',
  style: 'MJ_BizApps_Forms: Form Styles',
} as const;

const QUESTION_ENTITY = 'MJ_BizApps_Forms: Form Questions';

/**
 * The ids the OUTLINE minted for the questions, in outline order.
 *
 * First-save order IS outline order: the outline creates the rows and the detail pass only ever
 * re-saves them. Reading ids back this way rather than hand-writing them is what keeps these tests
 * honest about which row a key actually names.
 */
function stubIdsInOutlineOrder(): string[] {
  const seen: string[] = [];
  for (const row of saved.filter((r) => r.entity === QUESTION_ENTITY)) {
    const id = String(row.fields.ID);
    if (!seen.includes(id)) {
      seen.push(id);
    }
  }
  return seen;
}

/** What the question row with this id holds after the last write to it. */
function finalQuestion(id: string): Record<string, unknown> | undefined {
  return saved.filter((r) => r.entity === QUESTION_ENTITY && r.fields.ID === id).at(-1)?.fields;
}

/** How many times this row was written — 1 means the detail pass never touched it. */
function writeCount(id: string): number {
  return saved.filter((r) => r.entity === QUESTION_ENTITY && r.fields.ID === id).length;
}

const user = new UserInfo();
const channel = { sessionId: 'session-1', ownerUserId: 'user-1' };

const OUTLINE = {
  name: 'Conference RSVP',
  pages: [
    { title: 'Attendance', questions: [{ key: 'attending', type: 'YesNo', prompt: 'Coming?' }] },
    { title: 'Travel', questions: [{ type: 'YesNo', prompt: 'Hotel?' }] },
    { title: 'Extras', questions: [{ type: 'ShortText', prompt: 'Anything else?' }] },
  ],
};

/** A detail response for one page — richer than the stub it replaces. */
const detailFor = (title: string): string =>
  JSON.stringify({
    title,
    questions: [
      {
        type: 'SingleChoice',
        prompt: `${title} — detailed`,
        isRequired: true,
        options: [{ label: 'Yes' }, { label: 'No' }],
      },
    ],
  });

/** Collects every published event, in the order the pipeline emitted them. */
function recordingPublisher(): GenerateFormProgressEvent[] {
  const events: GenerateFormProgressEvent[] = [];
  setFormsProgressPublisher({
    publish(sessionId, ownerUserId, event) {
      // Identity travels with every event or delivery fails closed on a 6.x host.
      expect(sessionId).toBe(channel.sessionId);
      expect(ownerUserId).toBe(channel.ownerUserId);
      events.push(event);
    },
  });
  return events;
}

/** A model whose two stages are controllable per test. */
function stubModel(overrides: Partial<StagedAuthoringModel> = {}): StagedAuthoringModel & {
  outline: ReturnType<typeof vi.fn>;
  pageDetail: ReturnType<typeof vi.fn>;
} {
  return {
    outline: vi.fn(async () => JSON.stringify(OUTLINE)),
    pageDetail: vi.fn(async (input: { outline: { pages: Array<{ title?: string }> }; pageIndex: number }) =>
      detailFor(input.outline.pages[input.pageIndex].title ?? '?'),
    ),
    theme: vi.fn(async () => JSON.stringify({ cssVariables: { '--mjf-accent': '#0055aa' } })),
    ...overrides,
  } as StagedAuthoringModel & { outline: ReturnType<typeof vi.fn>; pageDetail: ReturnType<typeof vi.fn> };
}

const options = { inputMode: 'brief' as const, channel };

describe('shouldStage', () => {
  it('stages only when there is somebody to publish to', () => {
    expect(shouldStage(channel)).toBe(true);
    expect(shouldStage(undefined)).toBe(false);
  });
});

describe('runStagedAuthoring', () => {
  beforeEach(() => {
    saved.length = 0;
    rows.clear();
    resetFormsProgressPublisher();
  });

  it('publishes outline, one per page, media, theme, then complete', async () => {
    const events = recordingPublisher();
    await runStagedAuthoring('an RSVP', stubModel(), user, options);
    expect(events.map((e) => e.stage)).toEqual([
      'outline',
      'page',
      'page',
      'page',
      'image',
      'theme',
      'theme',
      'complete',
    ]);
  });

  it('makes the progress bar determinate from the very first event', async () => {
    // The whole point of the outline stage: the total is known at step 1, so the bar never has to
    // guess and never grows mid-build.
    const events = recordingPublisher();
    await runStagedAuthoring('an RSVP', stubModel(), user, options);
    // 1 outline + 3 pages + 1 media + 1 theme. Media and theme are counted even when they have
    // nothing to do — a maximum that depends on what the model happened to ask for is not a
    // determinate bar.
    expect(events[0].total).toBe(1 + OUTLINE.pages.length + 2);
    expect(events.every((e) => e.total === events[0].total)).toBe(true);
    // Media is ONE step however many pictures it makes, and the theme's two events share a step —
    // the second only updates the label. That is what keeps the total knowable at step 1.
    expect(events.map((e) => e.step)).toEqual([1, 2, 3, 4, 5, 6, 6, 6]);
  });

  it('names the form on every event, from the outline onward', async () => {
    const events = recordingPublisher();
    const result = await runStagedAuthoring('an RSVP', stubModel(), user, options);
    expect(events.every((e) => e.formId === result.built.formId)).toBe(true);
  });

  it('gives each page event the id of the page it changed', async () => {
    const events = recordingPublisher();
    const result = await runStagedAuthoring('an RSVP', stubModel(), user, options);
    const changedPages = events.filter((e) => e.stage === 'page').map((e) => e.changed?.pageId);
    expect([...changedPages].sort()).toEqual([...result.built.pageIds].sort());
  });

  it('emits nothing at all when there is no channel', async () => {
    // A silent build is a supported configuration, not a degraded one.
    const events = recordingPublisher();
    await runStagedAuthoring('an RSVP', stubModel(), user, { inputMode: 'brief' });
    expect(events).toHaveLength(0);
  });

  it('hands each detail call the whole outline, so pages are written in context', async () => {
    const model = stubModel();
    await runStagedAuthoring('an RSVP', model, user, options);
    for (const call of model.pageDetail.mock.calls) {
      expect(call[0].outline.pages).toHaveLength(3);
      expect(call[0].brief).toBe('an RSVP');
    }
  });
});

describe('runStagedAuthoring — degradation', () => {
  beforeEach(() => {
    saved.length = 0;
    rows.clear();
    resetFormsProgressPublisher();
  });

  it('completes the run when one page never details, and NAMES that page', async () => {
    const model = stubModel({
      pageDetail: vi.fn(async (input: { pageIndex: number; outline: { pages: Array<{ title?: string }> } }) => {
        if (input.pageIndex === 1) {
          throw new Error('provider exploded');
        }
        return detailFor(input.outline.pages[input.pageIndex].title ?? '?');
      }),
    } as Partial<StagedAuthoringModel>);
    const events = recordingPublisher();

    const result = await runStagedAuthoring('an RSVP', model, user, options);

    // Named, not counted: "2 of 3 pages" tells an author nothing they can act on.
    expect(result.degraded).toEqual(['page:2']);
    expect(events.at(-1)?.degraded).toEqual(['page:2']);
    expect(events.at(-1)?.stage).toBe('complete');
    // And the run still produced a form.
    expect(result.built.formId).toBeTruthy();
  });

  it('degrades a page whose detail is invalid, after exhausting its own retries', async () => {
    const pageDetail = vi.fn(async (input: { pageIndex: number; outline: { pages: Array<{ title?: string }> } }) =>
      input.pageIndex === 0 ? 'not json at all' : detailFor(input.outline.pages[input.pageIndex].title ?? '?'),
    );
    const result = await runStagedAuthoring('an RSVP', stubModel({ pageDetail } as Partial<StagedAuthoringModel>), user, options);

    expect(result.degraded).toEqual(['page:1']);
    // The retry is PER STAGE: the bad page cost three calls, the good ones one each.
    expect(pageDetail).toHaveBeenCalledTimes(MAX_DESIGNER_ATTEMPTS + 2);
  });

  it('feeds the validation error back to the model on a page retry', async () => {
    const pageDetail = vi.fn(async (input: { pageIndex: number; outline: { pages: Array<{ title?: string }> } }) =>
      input.pageIndex === 0 ? 'garbage' : detailFor('x'),
    );
    await runStagedAuthoring('an RSVP', stubModel({ pageDetail } as Partial<StagedAuthoringModel>), user, options);
    const retry = pageDetail.mock.calls.find((c) => c[0].previousAttempt !== undefined)?.[0];
    expect(retry?.previousAttempt).toBe('garbage');
    expect(retry?.validationError).toBeTruthy();
  });

  it('reports a clean run as no degradation at all', async () => {
    const events = recordingPublisher();
    const result = await runStagedAuthoring('an RSVP', stubModel(), user, options);
    expect(result.degraded).toEqual([]);
    expect(events.at(-1)?.degraded).toEqual([]);
  });

  it('FAILS the run when the outline is invalid — there is nothing to degrade to', async () => {
    const model = stubModel({ outline: vi.fn(async () => 'not a blueprint') } as Partial<StagedAuthoringModel>);
    await expect(runStagedAuthoring('an RSVP', model, user, options)).rejects.toThrow(/Outline was invalid/);
    expect(model.outline).toHaveBeenCalledTimes(MAX_DESIGNER_ATTEMPTS);
  });

  it('never lets a publisher failure touch the build', async () => {
    // The channel is cosmetic. A publisher that throws must not cost anybody a form.
    setFormsProgressPublisher({
      publish() {
        throw new Error('websocket is gone');
      },
    });
    const result = await runStagedAuthoring('an RSVP', stubModel(), user, options);
    expect(result.built.formId).toBeTruthy();
    expect(result.degraded).toEqual([]);
  });
});

describe('runStagedAuthoring — concurrency', () => {
  beforeEach(() => {
    saved.length = 0;
    rows.clear();
    resetFormsProgressPublisher();
  });

  it('never has more than PAGE_DETAIL_CONCURRENCY detail calls in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const manyPages = {
      name: 'Long form',
      pages: Array.from({ length: 8 }, (_, i) => ({
        title: `Page ${i + 1}`,
        questions: [{ type: 'ShortText', prompt: `Q${i + 1}` }],
      })),
    };
    const model = stubModel({
      outline: vi.fn(async () => JSON.stringify(manyPages)),
      pageDetail: vi.fn(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return detailFor('x');
      }),
    } as Partial<StagedAuthoringModel>);

    await runStagedAuthoring('a long one', model, user, options);

    expect(peak).toBeLessThanOrEqual(PAGE_DETAIL_CONCURRENCY);
    // And it actually used the pool rather than running one at a time.
    expect(peak).toBe(PAGE_DETAIL_CONCURRENCY);
    expect(model.pageDetail).toHaveBeenCalledTimes(8);
  });

  it('still details every page when there are fewer pages than the pool', async () => {
    const model = stubModel();
    await runStagedAuthoring('an RSVP', model, user, options);
    expect(model.pageDetail).toHaveBeenCalledTimes(3);
  });
});

describe('runStagedAuthoring — refining outline stubs in place', () => {
  beforeEach(() => {
    saved.length = 0;
    rows.clear();
    resetFormsProgressPublisher();
    resetGeneratedImageStore();
  });

  it('fills in the stub rows the outline created rather than making new questions', async () => {
    // The stub is the whole reason the author sees a form in two seconds. If the detail pass
    // created fresh rows instead of refining these, every question would appear twice.
    const model = stubModel({
      outline: vi.fn(async () =>
        JSON.stringify({
          name: 'RSVP',
          pages: [{ title: 'Attendance', questions: [{ type: 'YesNo', prompt: 'Coming?' }] }],
        }),
      ),
      pageDetail: vi.fn(async () =>
        JSON.stringify({
          questions: [
            {
              type: 'SingleChoice',
              prompt: 'Will you be joining us?',
              helpText: 'Pick one.',
              isRequired: true,
              options: [{ label: 'Yes' }, { label: 'No' }],
            },
          ],
        }),
      ),
    } as Partial<StagedAuthoringModel>);

    await runStagedAuthoring('an RSVP', model, user, options);

    const ids = stubIdsInOutlineOrder();
    expect(ids).toHaveLength(1);
    const refined = finalQuestion(ids[0]);
    // Type and prompt are overwritten: the detail pass is the later, better-informed judgement.
    expect(refined?.QuestionType).toBe('SingleChoice');
    expect(refined?.Prompt).toBe('Will you be joining us?');
    expect(refined?.HelpText).toBe('Pick one.');
    expect(refined?.IsRequired).toBe(true);
    // Options belong to the refined row, not to a duplicate.
    const opts = saved.filter((r) => r.entity === 'MJ_BizApps_Forms: Form Question Options');
    expect(opts).toHaveLength(2);
    expect(opts.every((o) => o.fields.QuestionID === ids[0])).toBe(true);
  });

  it('keeps an un-detailed stub rather than dropping the question', async () => {
    // Fewer detailed questions than stubs. The extra stub is already a valid question; losing it
    // would silently shorten the author's form.
    const model = stubModel({
      outline: vi.fn(async () =>
        JSON.stringify({
          name: 'RSVP',
          pages: [
            {
              title: 'Attendance',
              questions: [
                { type: 'YesNo', prompt: 'Coming?' },
                { type: 'ShortText', prompt: 'Anything else?' },
              ],
            },
          ],
        }),
      ),
      pageDetail: vi.fn(async () =>
        JSON.stringify({ questions: [{ type: 'YesNo', prompt: 'Coming along?' }] }),
      ),
    } as Partial<StagedAuthoringModel>);

    await runStagedAuthoring('an RSVP', model, user, options);

    const ids = stubIdsInOutlineOrder();
    expect(ids).toHaveLength(2);
    // The first was refined; the second was never re-saved, so it survives as the outline left it.
    expect(writeCount(ids[0])).toBe(2);
    expect(writeCount(ids[1])).toBe(1);
    expect(finalQuestion(ids[1])?.Prompt).toBe('Anything else?');
  });
});

describe('runStagedAuthoring — a reordered detail response', () => {
  beforeEach(() => {
    saved.length = 0;
    rows.clear();
    resetFormsProgressPublisher();
    resetGeneratedImageStore();
  });

  it('refines each question onto the stub its KEY names, not the one in that position', async () => {
    // THE BUG THIS GUARDS. Rules resolve through the key-to-id map the OUTLINE built, so a key
    // permanently names one row. Matching purely by position meant a model returning the same two
    // questions in the other order wrote question B's content onto question A's row — while every
    // rule naming A's key kept pointing at it. The form renders and one branch is silently gated on
    // the wrong answer, forever. That is the exact failure keys exist to prevent.
    const outline = {
      name: 'RSVP',
      pages: [
        {
          title: 'Details',
          questions: [
            { key: 'attending', type: 'YesNo', prompt: 'Will you attend?' },
            { key: 'diet', type: 'ShortText', prompt: 'Dietary needs?' },
          ],
        },
      ],
    };
    // The detail pass returns them in the OPPOSITE order, keys intact.
    const reordered = JSON.stringify({
      questions: [
        { key: 'diet', type: 'LongText', prompt: 'Tell us about any dietary needs' },
        {
          key: 'attending',
          type: 'SingleChoice',
          prompt: 'Can you make it?',
          options: [{ label: 'Yes' }, { label: 'No' }],
        },
      ],
    });

    await runStagedAuthoring(
      'an RSVP',
      stubModel({
        outline: vi.fn(async () => JSON.stringify(outline)),
        pageDetail: vi.fn(async () => reordered),
      } as Partial<StagedAuthoringModel>),
      user,
      options,
    );

    // Outline order: [0] is the row `attending` names, [1] is `diet`'s.
    const [attendingId, dietId] = stubIdsInOutlineOrder();
    expect(finalQuestion(attendingId)?.Prompt).toBe('Can you make it?');
    expect(finalQuestion(attendingId)?.QuestionType).toBe('SingleChoice');
    expect(finalQuestion(dietId)?.Prompt).toBe('Tell us about any dietary needs');
    expect(finalQuestion(dietId)?.QuestionType).toBe('LongText');
  });

  it('claims each stub once, so a repeated key cannot consume another question row', async () => {
    const outline = {
      name: 'RSVP',
      pages: [
        {
          title: 'Details',
          questions: [
            { key: 'attending', type: 'YesNo', prompt: 'Will you attend?' },
            { type: 'ShortText', prompt: 'Anything else?' },
          ],
        },
      ],
    };
    // Both detailed questions name the same key. Without single-claim the second would land on the
    // first's row and the unkeyed stub would be silently left behind.
    const duplicated = JSON.stringify({
      questions: [
        { key: 'attending', type: 'YesNo', prompt: 'Coming?' },
        { key: 'attending', type: 'ShortText', prompt: 'Notes?' },
      ],
    });

    await runStagedAuthoring(
      'an RSVP',
      stubModel({
        outline: vi.fn(async () => JSON.stringify(outline)),
        pageDetail: vi.fn(async () => duplicated),
      } as Partial<StagedAuthoringModel>),
      user,
      options,
    );

    const ids = stubIdsInOutlineOrder();
    expect(ids).toHaveLength(2);
    expect(finalQuestion(ids[0])?.Prompt).toBe('Coming?');
    // The second fell through to the next free stub rather than overwriting the first.
    expect(finalQuestion(ids[1])?.Prompt).toBe('Notes?');
  });

  it('still matches by position for the unkeyed questions', async () => {
    // Most questions carry no key — the Designer is told to add one only where a rule needs it —
    // so position has to keep working for them.
    const outline = {
      name: 'Plain',
      pages: [
        {
          title: 'Details',
          questions: [
            { type: 'ShortText', prompt: 'First' },
            { type: 'ShortText', prompt: 'Second' },
          ],
        },
      ],
    };
    await runStagedAuthoring(
      'a plain form',
      stubModel({
        outline: vi.fn(async () => JSON.stringify(outline)),
        pageDetail: vi.fn(async () =>
          JSON.stringify({
            questions: [
              { type: 'ShortText', prompt: 'First, refined' },
              { type: 'LongText', prompt: 'Second, refined' },
            ],
          }),
        ),
      } as Partial<StagedAuthoringModel>),
      user,
      options,
    );
    const [first, second] = stubIdsInOutlineOrder();
    expect(finalQuestion(first)?.Prompt).toBe('First, refined');
    expect(finalQuestion(second)?.Prompt).toBe('Second, refined');
  });
});

// --- Media and theme ---------------------------------------------------------------

/** An outline whose welcome screen and one option both ask for a picture. */
const OUTLINE_WITH_IMAGES = {
  name: 'Venue picker',
  pages: [{ title: 'Venue', questions: [{ type: 'PictureChoice', prompt: 'Which venue?' }] }],
  screens: {
    welcome: { title: 'Pick a venue', imagePrompt: 'a bright event hall' },
    endings: [{ title: 'Booked', isDefault: true }],
  },
  theme: { brandAdjectives: ['warm'] },
};

const PICTURE_DETAIL = JSON.stringify({
  questions: [
    {
      type: 'PictureChoice',
      prompt: 'Which venue?',
      options: [
        { label: 'Rooftop', imagePrompt: 'a rooftop bar at dusk' },
        { label: 'Hall', imagePrompt: 'a wood-panelled hall' },
      ],
    },
  ],
});

/** A stub image generator that hands back fixed bytes. */
function stubImageModel(over: Partial<{ generate: ReturnType<typeof vi.fn> }> = {}) {
  return {
    generate: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' })),
    ...over,
  };
}

/** A stub store that records what it was asked to keep. */
function stubImageStore(): Array<{ formId: string; fileName: string }> {
  const kept: Array<{ formId: string; fileName: string }> = [];
  setGeneratedImageStore({
    async store(formId, _bytes, _contentType, fileName) {
      kept.push({ formId, fileName });
      return { url: `https://assets.example.com/${kept.length}` };
    },
  });
  return kept;
}

describe('runStagedAuthoring — media', () => {
  beforeEach(() => {
    saved.length = 0;
    rows.clear();
    resetFormsProgressPublisher();
    resetGeneratedImageStore();
  });

  it('makes a picture for every prompt and attaches each to its row', async () => {
    const kept = stubImageStore();
    const imageModel = stubImageModel();
    const model = stubModel({
      outline: vi.fn(async () => JSON.stringify(OUTLINE_WITH_IMAGES)),
      pageDetail: vi.fn(async () => PICTURE_DETAIL),
    } as Partial<StagedAuthoringModel>);

    const result = await runStagedAuthoring('a venue picker', model, user, { ...options, imageModel });

    // One welcome hero + two option pictures. The option prompts come from the DETAIL pass, which
    // is the only place a staged build's options exist.
    expect(imageModel.generate).toHaveBeenCalledTimes(3);
    expect(kept).toHaveLength(3);
    const optionsWithImages = saved.filter(
      (r) => r.entity === ENTITY_NAME.option && typeof r.fields.ImageURL === 'string',
    );
    expect(optionsWithImages).toHaveLength(2);
    const screensWithMedia = saved.filter(
      (r) => r.entity === ENTITY_NAME.screen && typeof r.fields.MediaURL === 'string',
    );
    expect(screensWithMedia).toHaveLength(1);
    expect(result.degraded).toEqual([]);
  });

  it('degrades one failed image and keeps the rest', async () => {
    stubImageStore();
    let call = 0;
    const imageModel = stubImageModel({
      generate: vi.fn(async () => {
        if (++call === 2) {
          throw new Error('the image model is busy');
        }
        return { bytes: new Uint8Array([1]), contentType: 'image/png' };
      }),
    });
    const model = stubModel({
      outline: vi.fn(async () => JSON.stringify(OUTLINE_WITH_IMAGES)),
      pageDetail: vi.fn(async () => PICTURE_DETAIL),
    } as Partial<StagedAuthoringModel>);

    const result = await runStagedAuthoring('a venue picker', model, user, { ...options, imageModel });

    // Named, so an author knows WHICH picture is missing rather than counting them.
    expect(result.degraded).toHaveLength(1);
    expect(result.degraded[0]).toMatch(/^image:/);
    expect(result.built.formId).toBeTruthy();
  });

  it('says so when no image store is registered, instead of failing quietly', async () => {
    const imageModel = stubImageModel();
    const model = stubModel({
      outline: vi.fn(async () => JSON.stringify(OUTLINE_WITH_IMAGES)),
      pageDetail: vi.fn(async () => PICTURE_DETAIL),
    } as Partial<StagedAuthoringModel>);

    const result = await runStagedAuthoring('a venue picker', model, user, { ...options, imageModel });

    expect(result.degraded).toEqual(['image:no store configured on this instance']);
    expect(imageModel.generate).not.toHaveBeenCalled();
  });

  it('reports a missing image model only when pictures were actually asked for', async () => {
    stubImageStore();
    // The default outline asks for no pictures, so no image model is not a problem worth naming.
    const quiet = await runStagedAuthoring('an RSVP', stubModel(), user, options);
    expect(quiet.degraded).toEqual([]);

    const wanting = await runStagedAuthoring(
      'a venue picker',
      stubModel({
        outline: vi.fn(async () => JSON.stringify(OUTLINE_WITH_IMAGES)),
        pageDetail: vi.fn(async () => PICTURE_DETAIL),
      } as Partial<StagedAuthoringModel>),
      user,
      options,
    );
    expect(wanting.degraded).toEqual(['image:no image model available on this instance']);
  });

  it('caps the number of pictures and NAMES the overflow', async () => {
    stubImageStore();
    const imageModel = stubImageModel();
    const manyOptions = JSON.stringify({
      questions: [
        {
          type: 'PictureChoice',
          prompt: 'Which venue?',
          options: Array.from({ length: 9 }, (_, i) => ({
            label: `Venue ${i + 1}`,
            imagePrompt: `venue number ${i + 1}`,
          })),
        },
      ],
    });
    const model = stubModel({
      outline: vi.fn(async () => JSON.stringify(OUTLINE_WITH_IMAGES)),
      pageDetail: vi.fn(async () => manyOptions),
    } as Partial<StagedAuthoringModel>);

    const result = await runStagedAuthoring('a venue picker', model, user, { ...options, imageModel });

    expect(imageModel.generate).toHaveBeenCalledTimes(MAX_GENERATED_IMAGES);
    // A silent cap reads to an author as "the AI decided six was enough". Every skipped picture is
    // named, and the reason is in the marker.
    const overflow = result.degraded.filter((d) => d.includes('over the'));
    expect(overflow).toHaveLength(10 - MAX_GENERATED_IMAGES);
  });
});

describe('runStagedAuthoring — theme', () => {
  beforeEach(() => {
    saved.length = 0;
    rows.clear();
    resetFormsProgressPublisher();
    resetGeneratedImageStore();
  });

  it('writes the validated tokens onto the style the builder already linked', async () => {
    const model = stubModel({
      theme: vi.fn(async () =>
        JSON.stringify({ cssVariables: { '--mjf-accent': '#0055aa', '--mjf-page-bg': '#ffffff' } }),
      ),
    } as Partial<StagedAuthoringModel>);

    const result = await runStagedAuthoring('an RSVP', model, user, options);

    // The LAST save of the style row, which is the theme write-back rather than its creation.
    const styleSaves = saved.filter((r) => r.entity === ENTITY_NAME.style);
    const tokens = JSON.parse(String(styleSaves.at(-1)?.fields.CSSVariables));
    expect(tokens['--mjf-accent']).toBe('#0055aa');
    // Written onto the SAME row the form points at — a second style row would orphan the first.
    expect(styleSaves.at(-1)?.fields.ID).toBe(result.built.styleId);
  });

  it('hands the theme prompt the brand adjectives the outline chose', async () => {
    const model = stubModel({
      outline: vi.fn(async () =>
        JSON.stringify({ ...OUTLINE, theme: { brandAdjectives: ['warm', 'professional'] } }),
      ),
    } as Partial<StagedAuthoringModel>);
    await runStagedAuthoring('an RSVP', model, user, options);
    expect(model.theme.mock.calls[0][0].brandAdjectives).toEqual(['warm', 'professional']);
  });

  it('strips a token the widget does not read before persisting it', async () => {
    const model = stubModel({
      theme: vi.fn(async () =>
        JSON.stringify({ cssVariables: { '--mjf-accent': '#0055aa', '--mjf-invented': 'cosy' } }),
      ),
    } as Partial<StagedAuthoringModel>);
    await runStagedAuthoring('an RSVP', model, user, options);
    const tokens = JSON.parse(
      String(saved.filter((r) => r.entity === ENTITY_NAME.style).at(-1)?.fields.CSSVariables),
    );
    expect(tokens['--mjf-invented']).toBeUndefined();
    expect(tokens['--mjf-accent']).toBe('#0055aa');
  });

  it('reports a palette that cannot carry readable text', async () => {
    // Fixed by arithmetic where it can be, and NAMED where it cannot — a background nobody can
    // read on is a decision the author has to make, not one to make for them.
    const model = stubModel({
      theme: vi.fn(async () =>
        JSON.stringify({ cssVariables: { '--mjf-page-bg': '#777777', '--mjf-page-ink': '#7a7a7a' } }),
      ),
    } as Partial<StagedAuthoringModel>);
    const result = await runStagedAuthoring('a grey form', model, user, options);
    expect(result.degraded).toEqual(['theme:--mjf-page-ink on --mjf-page-bg cannot reach AA contrast']);
  });

  it('degrades — never fails — when the theme prompt keeps returning nonsense', async () => {
    const theme = vi.fn(async () => 'not a token map');
    const result = await runStagedAuthoring(
      'an RSVP',
      stubModel({ theme } as Partial<StagedAuthoringModel>),
      user,
      options,
    );
    expect(result.degraded).toEqual(['theme:could not be generated']);
    expect(result.built.formId).toBeTruthy();
    expect(theme).toHaveBeenCalledTimes(MAX_DESIGNER_ATTEMPTS);
  });
});
