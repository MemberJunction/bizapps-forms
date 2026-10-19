/**
 * `endingScreenFrom` — the ending `Forms.SaveResponse` chose, turned into the screen the widget draws.
 */
import { describe, expect, it } from 'vitest';
import type { FormsRespondentEnding } from '@mj-biz-apps/forms-entities';

import { endingScreenFrom } from './server-ending';

const ending = (overrides: Partial<FormsRespondentEnding> = {}): FormsRespondentEnding => ({
  ID: 'e1',
  Title: 'Thanks',
  Body: 'We will be in touch.',
  ButtonLabel: 'Close',
  MediaURL: '/forms/asset/a1137587-b23a-4f0d-9049-efc0bdcfc59a',
  RedirectURL: 'https://example.com/next',
  SocialLinks: [
    { Platform: 'github', URL: 'https://github.com/x' },
    { Platform: 'myspace', URL: 'https://myspace.example' },
  ],
  IsDisqualification: false,
  ...overrides,
});

describe('endingScreenFrom', () => {
  it('carries the copy, resolves the image against this widget\'s API, and keeps only drawable links', () => {
    expect(endingScreenFrom(ending(), 'https://h/api/graphql')).toEqual({
      id: 'e1',
      screenType: 'Ending',
      title: 'Thanks',
      body: 'We will be in touch.',
      buttonLabel: 'Close',
      mediaURL: 'https://h/api/forms/asset/a1137587-b23a-4f0d-9049-efc0bdcfc59a',
      displayOrder: 0,
      isDisqualification: false,
      socialLinks: [{ platform: 'github', url: 'https://github.com/x' }],
    });
  });

  it('leaves absent copy absent, and never copies the redirect — the result\'s RedirectURL is the one followed', () => {
    const screen = endingScreenFrom(ending({ Body: null, ButtonLabel: null, MediaURL: null, IsDisqualification: true }), '');
    expect('body' in screen || 'buttonLabel' in screen || 'mediaURL' in screen || 'redirectURL' in screen).toBe(false);
    expect(screen.isDisqualification).toBe(true);
  });
});
