import { describe, expect, it } from 'vitest';
import { parsePublishedDefinition } from '../snapshot-parser';
import { makeDefinition } from './fakes';
import { FORM_QUESTION_TYPES } from '@mj-biz-apps/forms-entities';

describe('parsePublishedDefinition', () => {
  it('round-trips a valid snapshot', () => {
    const def = makeDefinition();
    const parsed = parsePublishedDefinition(JSON.stringify(def));
    expect(parsed?.formId).toBe('form-1');
    expect(parsed?.pages[0].questions[0].type).toBe('ShortText');
  });

  it('returns undefined for null/empty input', () => {
    expect(parsePublishedDefinition(null)).toBeUndefined();
    expect(parsePublishedDefinition('')).toBeUndefined();
  });

  it('returns undefined for malformed JSON (fail closed)', () => {
    expect(parsePublishedDefinition('{not json')).toBeUndefined();
  });

  it('returns undefined when a required top-level field is missing', () => {
    expect(parsePublishedDefinition(JSON.stringify({ formId: 'x' }))).toBeUndefined();
  });

  it('rejects an unknown question type', () => {
    const def = makeDefinition();
    const broken = JSON.parse(JSON.stringify(def));
    broken.pages[0].questions[0].type = 'Hologram';
    expect(parsePublishedDefinition(JSON.stringify(broken))).toBeUndefined();
  });

  describe('automations', () => {
    it('carries a published automation through the parse', () => {
      const def = JSON.parse(JSON.stringify(makeDefinition()));
      def.automations = [
        {
          id: 'auto-1',
          name: 'Email confirmation',
          targetType: 'Action',
          actionId: 'act-1',
          trigger: 'OnComplete',
          executionMode: 'Sync',
          displayOrder: 1,
          continueOnError: true,
          isActive: true,
        },
      ];

      const parsed = parsePublishedDefinition(JSON.stringify(def));

      expect(parsed?.automations).toHaveLength(1);
      expect(parsed?.automations[0]).toMatchObject({
        id: 'auto-1',
        name: 'Email confirmation',
        targetType: 'Action',
        actionId: 'act-1',
        trigger: 'OnComplete',
        executionMode: 'Sync',
        displayOrder: 1,
        isActive: true,
      });
    });
  });
});

describe('the types added with element parity', () => {
  it('accepts every type the contract declares', () => {
    // The gate this replaces was a 15-string set copied out of the contract by hand, with no way
    // to learn that the contract had grown — so a form published with any newer type parsed as
    // `undefined` and the whole form went offline.
    for (const type of FORM_QUESTION_TYPES) {
      const broken = JSON.parse(JSON.stringify(makeDefinition()));
      broken.pages[0].questions[0].type = type;
      expect(parsePublishedDefinition(JSON.stringify(broken)), type).toBeDefined();
    }
  });

  it('still rejects a type outside the contract', () => {
    const broken = JSON.parse(JSON.stringify(makeDefinition()));
    broken.pages[0].questions[0].type = 'Payment';
    expect(parsePublishedDefinition(JSON.stringify(broken))).toBeUndefined();
  });

  it('is not fooled by an inherited Object property posing as a type', () => {
    const broken = JSON.parse(JSON.stringify(makeDefinition()));
    broken.pages[0].questions[0].type = 'constructor';
    expect(parsePublishedDefinition(JSON.stringify(broken))).toBeUndefined();
  });

  it('carries the option image and matrix axis through', () => {
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    def.pages[0].questions[0].options = [
      { id: 'o1', label: 'A', value: 'a', displayOrder: 0, imageURL: 'https://img/a.png' },
      { id: 'o2', label: 'Col', value: 'col', displayOrder: 1, matrixAxis: 'Column' },
      { id: 'o3', label: 'Junk', value: 'junk', displayOrder: 2, matrixAxis: 'Sideways' },
    ];
    const parsed = parsePublishedDefinition(JSON.stringify(def))!;
    expect(parsed.pages[0].questions[0].options[0].imageURL).toBe('https://img/a.png');
    expect(parsed.pages[0].questions[0].options[1].matrixAxis).toBe('Column');
    // An axis we do not recognise degrades to "no axis", which the widget reads as a Row —
    // a usable grid rather than an option that belongs to neither axis and renders nowhere.
    expect(parsed.pages[0].questions[0].options[2].matrixAxis).toBeUndefined();
  });

  it('carries the partial-submit-point flag through', () => {
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    def.pages[0].isPartialSubmitPoint = true;
    expect(parsePublishedDefinition(JSON.stringify(def))?.pages[0].isPartialSubmitPoint).toBe(true);
  });
});

describe('screens', () => {
  it('parses a welcome screen and the ending list', () => {
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    def.welcomeScreen = { id: 'w', screenType: 'Welcome', title: 'Hello', buttonLabel: 'Start', displayOrder: 0 };
    def.endScreens = [
      { id: 'e1', screenType: 'Ending', title: 'Thanks', displayOrder: 0, isDefault: true },
      { id: 'e2', screenType: 'Ending', title: 'Booked', displayOrder: 1, redirectURL: 'https://book.example.com' },
    ];
    const parsed = parsePublishedDefinition(JSON.stringify(def))!;
    expect(parsed.welcomeScreen?.title).toBe('Hello');
    expect(parsed.endScreens).toHaveLength(2);
    expect(parsed.endScreens[1].redirectURL).toBe('https://book.example.com');
  });

  it('carries an ending screen\'s social links through to the respondent', () => {
    // The parser enumerates every field it copies, and socialLinks was added to the publish
    // side without being added here — so the builder saved them, publish captured them, the
    // snapshot in the database held them, and this function silently dropped them on the way
    // out. The author saw their links in the builder and respondents never saw them at all,
    // with nothing anywhere reporting a problem.
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    def.endScreens = [{
      id: 'e1', screenType: 'Ending', title: 'Thanks', displayOrder: 0, isDefault: true,
      socialLinks: [
        { platform: 'linkedin', url: 'https://linkedin.com/' },
        { platform: 'instagram', url: 'https://www.instagram.com/' },
      ],
    }];
    const parsed = parsePublishedDefinition(JSON.stringify(def))!;
    expect(parsed.endScreens[0].socialLinks).toEqual([
      { platform: 'linkedin', url: 'https://linkedin.com/' },
      { platform: 'instagram', url: 'https://www.instagram.com/' },
    ]);
  });

  it('drops a social link the widget could not draw, rather than shipping a blank icon', () => {
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    def.endScreens = [{
      id: 'e1', screenType: 'Ending', title: 'Thanks', displayOrder: 0,
      socialLinks: [
        { platform: 'linkedin', url: 'https://linkedin.com/' },
        { platform: 'myspace', url: 'https://myspace.com/' },
        { platform: 'instagram', url: 'javascript:alert(1)' },
      ],
    }];
    const links = parsePublishedDefinition(JSON.stringify(def))!.endScreens[0].socialLinks ?? [];
    expect(links.map((l) => l.platform)).toEqual(['linkedin']);
  });

  it('leaves socialLinks absent when the screen has none', () => {
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    def.endScreens = [{ id: 'e1', screenType: 'Ending', title: 'Thanks', displayOrder: 0 }];
    expect(parsePublishedDefinition(JSON.stringify(def))!.endScreens[0].socialLinks).toBeUndefined();
  });

  it('forces the screen type to the slot it was found in', () => {
    // A screen sitting in `endScreens` IS an ending whatever its own field claims. Honouring the
    // mismatch would produce an "Ending" the widget shows BEFORE intake.
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    def.endScreens = [{ id: 'e', screenType: 'Welcome', title: 'Confused', displayOrder: 0 }];
    expect(parsePublishedDefinition(JSON.stringify(def))?.endScreens[0].screenType).toBe('Ending');
  });

  it('drops a malformed ending without taking the form down', () => {
    // Deliberately unlike a malformed PAGE, which fails the whole snapshot: a broken thank-you
    // page costs a respondent a screen they have never seen, and `endingMessage` has a fallback.
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    def.endScreens = [{ id: 'ok', screenType: 'Ending', title: 'Fine', displayOrder: 0 }, { title: 'No id' }];
    const parsed = parsePublishedDefinition(JSON.stringify(def));
    expect(parsed).toBeDefined();
    expect(parsed?.endScreens).toHaveLength(1);
  });

  it('reads a snapshot published before screens existed as having none', () => {
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    delete def.welcomeScreen;
    delete def.endScreens;
    const parsed = parsePublishedDefinition(JSON.stringify(def))!;
    expect(parsed.welcomeScreen).toBeUndefined();
    expect(parsed.endScreens).toEqual([]);
  });
});

/**
 * A broken on-submit mode must never take the form down.
 *
 * `onSubmitMode` is side-effect configuration: it decides what runs AFTER a submission and is
 * invisible to the respondent filling the form in. That puts it in the same class as
 * `automations`, which this parser is deliberately lenient about for exactly this reason — a
 * corrupt entry there is dropped rather than allowed to refuse the whole snapshot, "because
 * refusing to serve the form because one automation entry is corrupt would take the form down for
 * everyone to protect a side effect".
 *
 * When the field was first added it did not follow that rule: it went through the strict zod
 * settings schema, so ANY unrecognised value — a typo, the wrong case, a null — failed the whole
 * settings parse, which failed the whole snapshot, which served every respondent "Form
 * unavailable". The builder made that reachable: its own settings parser is a whitelist that
 * copies `onSubmitMode` through without validating it.
 *
 * Degrading to absent is the safe direction: absent means "infer", which is the behaviour every
 * form had before this field existed.
 */
describe('a malformed onSubmitMode degrades instead of taking the form offline', () => {
  function withMode(mode: unknown): ReturnType<typeof parsePublishedDefinition> {
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    def.settings.onSubmitMode = mode;
    return parsePublishedDefinition(JSON.stringify(def));
  }

  it.each([
    ['a typo', 'Legcy'],
    ['the wrong case', 'configured'],
    ['an empty string', ''],
    ['null', null],
    ['a number', 5],
    ['an object', {}],
  ])('still serves the form when the mode is %s', (_label, mode) => {
    const parsed = withMode(mode);

    expect(parsed).toBeDefined();
    expect(parsed?.pages[0].questions[0].type).toBe('ShortText');
    // Dropped, not guessed at — an unreadable declaration is not a declaration.
    expect(parsed?.settings.onSubmitMode).toBeUndefined();
  });

  it('still carries the two values it does recognise', () => {
    expect(withMode('Configured')?.settings.onSubmitMode).toBe('Configured');
    expect(withMode('Legacy')?.settings.onSubmitMode).toBe('Legacy');
  });

  it('keeps the rest of the settings when the mode is dropped', () => {
    const def = JSON.parse(JSON.stringify(makeDefinition()));
    def.settings = { anonymousAllowed: false, captchaRequired: true, quota: 10, onSubmitMode: 'nonsense' };

    const parsed = parsePublishedDefinition(JSON.stringify(def));

    expect(parsed?.settings.anonymousAllowed).toBe(false);
    expect(parsed?.settings.captchaRequired).toBe(true);
    expect(parsed?.settings.quota).toBe(10);
  });
});
