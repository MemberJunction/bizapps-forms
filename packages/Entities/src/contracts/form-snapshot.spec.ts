import { describe, it, expect } from 'vitest';
import { THEME_LAYOUT_TOKENS } from './default-theme';
import {
  buildFormSnapshot,
  describeFormSnapshot,
  resolveHandle,
  type FormSnapshot,
} from './form-snapshot';

const GUID = {
  page: 'aaaaaaaa-1111-4111-8111-111111111111',
  name: 'bbbbbbbb-2222-4222-8222-222222222222',
  email: 'cccccccc-3333-4333-8333-333333333333',
};

/** A one-page form, as the serialiser would have built it from real rows. */
const snapshot: FormSnapshot = {
  formId: 'ffffffff-0000-4000-8000-000000000000',
  name: 'Assessment',
  status: 'Draft',
  responseCount: 0,
  pages: [
    {
      handle: 'p1',
      id: GUID.page,
      title: 'Contact details',
      questions: [
        {
          handle: 'q1',
          id: GUID.name,
          type: 'ShortText',
          prompt: 'Your name',
          isRequired: true,
          answerCount: 0,
          options: [],
        },
        {
          handle: 'q2',
          id: GUID.email,
          type: 'Email',
          prompt: 'Email address',
          isRequired: false,
          answerCount: 0,
          options: [],
        },
      ],
    },
  ],
  screens: [],
  cssVariables: {},
};

/**
 * The tracer: the two halves have to agree.
 *
 * The model only ever sees the DESCRIPTION, and only ever names things by handle. The applier only
 * ever takes handles and turns them into real ids. If the string the model reads and the map the
 * server resolves against can disagree, every edit lands on the wrong row — so this is the first
 * property to pin, before any operation exists to use it.
 */
describe('a form the assistant can point at', () => {
  it('shows a handle for every question, and resolves it back to the real row', () => {
    const text = describeFormSnapshot(snapshot);

    expect(text).toContain('q1');
    expect(text).toContain('Your name');
    expect(resolveHandle(snapshot, 'q1')?.id).toBe(GUID.name);
    expect(resolveHandle(snapshot, 'q2')?.id).toBe(GUID.email);
  });

  it('never puts a raw id in front of the model', () => {
    // Handles exist so the model cannot name a row it was not shown — an invented handle resolves
    // to nothing, where an invented GUID might hit a real row in somebody else's form. Leaking one
    // into the description would hand it the alphabet it needs to guess.
    const text = describeFormSnapshot(snapshot);
    for (const id of Object.values(GUID)) {
      expect(text, `${id} must not appear`).not.toContain(id);
    }
    expect(text).not.toContain(snapshot.formId);
  });
});

describe('buildFormSnapshot — handles are assigned, not authored', () => {
  const rows = {
    formId: 'ffffffff-0000-4000-8000-000000000000',
    name: 'Assessment',
    status: 'Draft',
    responseCount: 3,
    cssVariables: { '--mjf-accent': '#1b7fa8' },
    pages: [
      {
        id: GUID.page,
        title: 'Contact details',
        questions: [
          { id: GUID.name, type: 'ShortText', prompt: 'Your name', isRequired: true, answerCount: 3, options: [] },
          {
            id: GUID.email,
            type: 'Dropdown',
            prompt: 'How did you hear?',
            isRequired: false,
            answerCount: 0,
            options: [
              { id: 'o-search', label: 'Search' },
              { id: 'o-friend', label: 'A friend' },
            ],
          },
        ],
      },
      {
        id: 'dddddddd-4444-4444-8444-444444444444',
        title: 'Feedback',
        questions: [
          { id: 'ee-1', type: 'Rating', prompt: 'Rate us', isRequired: false, answerCount: 0, options: [] },
        ],
      },
    ],
    screens: [
      { id: 'ss-1', role: 'welcome' as const, title: 'Hello', isDefault: false },
      { id: 'ss-2', role: 'ending' as const, title: 'Thanks', isDefault: true },
    ],
  };

  it('numbers each kind in document order, continuing across pages', () => {
    const snap = buildFormSnapshot(rows);
    expect(snap.pages.map((p) => p.handle)).toEqual(['p1', 'p2']);
    // q3 is on page 2 — question numbering is per FORM, not per page, so a handle names one
    // question for the whole turn no matter which page an operation moves it to.
    expect(snap.pages.flatMap((p) => p.questions.map((q) => q.handle))).toEqual(['q1', 'q2', 'q3']);
    expect(snap.screens.map((s) => s.handle)).toEqual(['s1', 's2']);
  });

  it('numbers options per form too, so one handle never names two choices', () => {
    const snap = buildFormSnapshot(rows);
    expect(snap.pages[0].questions[1].options.map((o) => o.handle)).toEqual(['o1', 'o2']);
  });

  it('resolves every handle it minted back to the row it came from', () => {
    const snap = buildFormSnapshot(rows);
    expect(resolveHandle(snap, 'p2')?.id).toBe('dddddddd-4444-4444-8444-444444444444');
    expect(resolveHandle(snap, 'q3')?.id).toBe('ee-1');
    expect(resolveHandle(snap, 'o2')?.id).toBe('o-friend');
    expect(resolveHandle(snap, 's2')?.id).toBe('ss-2');
  });

  it('has no handle for something it was never given', () => {
    expect(resolveHandle(buildFormSnapshot(rows), 'q99')).toBeUndefined();
  });

  it('carries the counts and colours through untouched', () => {
    const snap = buildFormSnapshot(rows);
    expect(snap.responseCount).toBe(3);
    expect(snap.pages[0].questions[0].answerCount).toBe(3);
    expect(snap.cssVariables['--mjf-accent']).toBe('#1b7fa8');
  });
});

describe('describeFormSnapshot — what the model can see it can act on', () => {
  const full = buildFormSnapshot({
    formId: 'ffffffff-0000-4000-8000-000000000000',
    name: 'Assessment',
    status: 'Published',
    responseCount: 12,
    cssVariables: { '--mjf-page-bg': '#121827', '--mjf-question-size': '1.0625rem' },
    pages: [
      {
        id: GUID.page,
        title: 'Feedback',
        questions: [
          {
            id: GUID.name,
            type: 'Dropdown',
            prompt: 'How did you hear?',
            isRequired: false,
            answerCount: 12,
            options: [
              { id: 'o-a', label: 'Search' },
              { id: 'o-b', label: 'A friend' },
            ],
          },
        ],
      },
    ],
    screens: [
      { id: 'ss-1', role: 'welcome', title: 'Become a Volunteer', isDefault: false },
      { id: 'ss-2', role: 'ending', title: 'Thanks!', isDefault: true },
    ],
  });

  it('shows the screens, so the assistant can reword them', () => {
    const text = describeFormSnapshot(full);
    expect(text).toContain('s1');
    expect(text).toContain('Become a Volunteer');
    expect(text).toContain('s2');
  });

  it('marks which ending is the default one', () => {
    // A form can carry several endings behind conditional rules; exactly one is the fallback.
    // Rewording "the thank-you screen" means nothing without knowing which that is.
    expect(describeFormSnapshot(full)).toMatch(/s2[^\n]*default/i);
  });

  it('separates colours from layout, because the assistant may only set one of them', () => {
    // Sizing, alignment and radius stay the house decision unless the author asks for them by
    // name. Listing them in the same block as the palette is how a model concludes it may set
    // them freely.
    const text = describeFormSnapshot(full);
    expect(text).toContain('--mjf-page-bg');
    expect(text).toContain('--mjf-question-size');
    expect(text.indexOf('COLOURS')).toBeGreaterThan(-1);
    expect(text.indexOf('LAYOUT')).toBeGreaterThan(text.indexOf('COLOURS'));
  });

  it('shows a choice question its choices', () => {
    const text = describeFormSnapshot(full);
    expect(text).toContain('o1 Search');
    expect(text).toContain('o2 A friend');
  });

  it('says how many people have answered, per question and overall', () => {
    // The number the assistant needs to refuse a destructive edit in its own words.
    const text = describeFormSnapshot(full);
    expect(text).toContain('12 responses');
    expect(text).toContain('12 answers');
  });
});

describe('the two layout-token lists must not drift', () => {
  /**
   * `default-theme.ts` lists these to PROTECT them during a merge; `form-snapshot.ts` lists them to
   * DESCRIBE them to a model. Same five names, two different jobs, two different files — which is
   * exactly the shape that goes quietly out of sync. A token added to one and not the other either
   * becomes silently un-settable or silently settable by the assistant, and neither shows up as a
   * failure anywhere else.
   */
  it('describes exactly the tokens the merge protects', () => {
    const described = buildFormSnapshot({
      formId: 'f', name: 'n', status: 'Draft', responseCount: 0,
      cssVariables: Object.fromEntries(THEME_LAYOUT_TOKENS.map((t) => [t, 'x'])),
      pages: [], screens: [],
    });
    const text = describeFormSnapshot(described);
    const layoutBlock = text.slice(text.indexOf('LAYOUT'));
    for (const token of THEME_LAYOUT_TOKENS) {
      expect(layoutBlock, `${token} must be described as layout`).toContain(token);
    }
    // And nothing that is NOT a layout token may appear under that heading.
    const colourOnly = buildFormSnapshot({
      formId: 'f', name: 'n', status: 'Draft', responseCount: 0,
      cssVariables: { '--mjf-accent': '#1b7fa8' },
      pages: [], screens: [],
    });
    expect(describeFormSnapshot(colourOnly)).not.toContain('LAYOUT');
  });
});
