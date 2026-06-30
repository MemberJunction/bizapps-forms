/**
 * Seed data for {@link FormsMockApiService}: a single multi-page published form that
 * covers all 15 Phase-1 question types, conditional show/hide, and validation rules.
 */
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

/** Build the demo form definition for a given (ignored) distribution slug. */
export function buildMockForm(_distributionSlug: string): PublishedFormDefinition {
  return {
    formId: 'mock-form-1',
    formVersionId: 'mock-version-1',
    name: 'Community Event Sign-up',
    description: 'A short form demonstrating every Phase-1 question type.',
    renderMode: 'Scroll',
    settings: {
      anonymousAllowed: true,
      captchaRequired: false,
      confirmationMessage: 'Thanks for signing up — see you at the event!',
    },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'page-1',
        title: 'About you',
        description: 'Tell us who you are.',
        displayOrder: 1,
        questions: [
          {
            id: 'q-name',
            type: 'ShortText',
            prompt: 'Your full name',
            isRequired: true,
            displayOrder: 1,
            options: [],
            validationRule: { maxLength: 120 },
          },
          {
            id: 'q-email',
            type: 'Email',
            prompt: 'Email address',
            helpText: "We'll only use this to send your confirmation.",
            isRequired: true,
            displayOrder: 2,
            options: [],
          },
          {
            id: 'q-phone',
            type: 'Phone',
            prompt: 'Mobile number',
            isRequired: false,
            displayOrder: 3,
            options: [],
          },
          {
            id: 'q-guests',
            type: 'Number',
            prompt: 'How many guests are you bringing?',
            isRequired: false,
            displayOrder: 4,
            options: [],
            validationRule: { min: 0, max: 10 },
            settings: { placeholder: '0' },
          },
        ],
      },
      {
        id: 'page-2',
        title: 'Your preferences',
        displayOrder: 2,
        questions: [
          {
            id: 'q-statement',
            type: 'Statement',
            prompt: 'Help us tailor the day to you',
            helpText: 'These questions are optional but appreciated.',
            isRequired: false,
            displayOrder: 1,
            options: [],
          },
          {
            id: 'q-session',
            type: 'SingleChoice',
            prompt: 'Which session will you attend?',
            isRequired: true,
            displayOrder: 2,
            options: [
              { id: 'o-morning', label: 'Morning', value: 'morning', displayOrder: 1 },
              { id: 'o-afternoon', label: 'Afternoon', value: 'afternoon', displayOrder: 2 },
              { id: 'o-other', label: 'Other', value: 'other', displayOrder: 3 },
            ],
          },
          {
            id: 'q-session-other',
            type: 'ShortText',
            prompt: 'Please tell us when suits you',
            isRequired: true,
            displayOrder: 3,
            options: [],
            conditionalRule: {
              show: { all: [{ questionId: 'q-session', op: 'equals', value: 'other' }] },
            },
          },
          {
            id: 'q-topics',
            type: 'MultiChoice',
            prompt: 'Topics you are interested in',
            isRequired: false,
            displayOrder: 4,
            options: [
              { id: 't-ai', label: 'AI', value: 'ai', displayOrder: 1 },
              { id: 't-data', label: 'Data', value: 'data', displayOrder: 2 },
              { id: 't-design', label: 'Design', value: 'design', displayOrder: 3 },
            ],
          },
          {
            id: 'q-shirt',
            type: 'Dropdown',
            prompt: 'T-shirt size',
            isRequired: false,
            displayOrder: 5,
            options: [
              { id: 's-s', label: 'Small', value: 'S', displayOrder: 1 },
              { id: 's-m', label: 'Medium', value: 'M', displayOrder: 2, isDefault: true },
              { id: 's-l', label: 'Large', value: 'L', displayOrder: 3 },
            ],
          },
          {
            id: 'q-diet',
            type: 'LongText',
            prompt: 'Any dietary requirements?',
            isRequired: false,
            displayOrder: 6,
            options: [],
            settings: { rows: 4 },
          },
        ],
      },
      {
        id: 'page-3',
        title: 'Feedback & logistics',
        displayOrder: 3,
        questions: [
          {
            id: 'q-rating',
            type: 'Rating',
            prompt: 'How excited are you?',
            isRequired: false,
            displayOrder: 1,
            options: [],
            settings: { max: 5 },
          },
          {
            id: 'q-nps',
            type: 'NPS',
            prompt: 'How likely are you to recommend this event to a friend?',
            isRequired: false,
            displayOrder: 2,
            options: [],
          },
          {
            id: 'q-newsletter',
            type: 'YesNo',
            prompt: 'Subscribe to the newsletter?',
            isRequired: false,
            displayOrder: 3,
            options: [],
          },
          {
            id: 'q-date',
            type: 'Date',
            prompt: 'Preferred follow-up date',
            isRequired: false,
            displayOrder: 4,
            options: [],
          },
          {
            id: 'q-time',
            type: 'Time',
            prompt: 'Preferred follow-up time',
            isRequired: false,
            displayOrder: 5,
            options: [],
          },
          {
            id: 'q-file',
            type: 'FileUpload',
            prompt: 'Attach a photo (optional)',
            isRequired: false,
            displayOrder: 6,
            options: [],
            settings: { accept: 'image/*' },
          },
        ],
      },
    ],
  };
}
