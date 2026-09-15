import { describe, expect, it } from 'vitest';
import type { PublishedFormDefinition, PublishedFormScreen } from '@mj-biz-apps/forms-entities';

import { screenChips } from './screen-strip';

function screen(overrides: Partial<PublishedFormScreen> = {}): PublishedFormScreen {
  return { id: 'e1', screenType: 'Ending', title: 'Thanks', displayOrder: 0, ...overrides };
}

function definition(overrides: Partial<PublishedFormDefinition> = {}): PublishedFormDefinition {
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Test form',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    pages: [],
    automations: [],
    endScreens: [],
    ...overrides,
  };
}

describe('screenChips', () => {
  it('labels the fixed surfaces by their role', () => {
    // A welcome screen's identity IS its role — there is only ever one — so its own title
    // would be a longer way of saying the same thing.
    const def = definition({ welcomeScreen: screen({ screenType: 'Welcome', title: 'Hi there' }) });
    expect(screenChips(def).map((c) => c.label)).toEqual(['Welcome', 'Questions', 'Ending']);
  });

  it('labels each authored ending by its own title, which is what tells them apart', () => {
    const def = definition({
      endScreens: [
        screen({ id: 'a', displayOrder: 0, title: 'Booked a call' }),
        screen({ id: 'b', displayOrder: 1, title: 'Not a fit' }),
      ],
    });
    expect(screenChips(def).map((c) => c.label)).toEqual(['Questions', 'Booked a call', 'Not a fit']);
  });

  it('falls back to a role label for an ending with a blank title', () => {
    const def = definition({ endScreens: [screen({ id: 'a', title: '   ' })] });
    expect(screenChips(def).map((c) => c.label)).toEqual(['Questions', 'Ending']);
  });

  it('says in the tooltip when an ending only shows conditionally', () => {
    // The author cannot otherwise tell why this screen never appears when they fill the form
    // normally — which is the exact confusion the strip exists to remove.
    const def = definition({
      endScreens: [
        screen({ id: 'a', displayOrder: 0, title: 'Qualified', conditionalRule: { show: { all: [] } } }),
        screen({ id: 'b', displayOrder: 1, title: 'Everyone' }),
      ],
    });
    const [, qualified, everyone] = screenChips(def);
    expect(qualified.hint).toContain('condition');
    expect(everyone.hint).toBe('Everyone');
  });

  it('carries the selection each chip commands', () => {
    const def = definition({ endScreens: [screen({ id: 'a' })] });
    expect(screenChips(def).map((c) => c.screen)).toEqual([
      { kind: 'questions' },
      { kind: 'ending', screenId: 'a' },
    ]);
  });
});
