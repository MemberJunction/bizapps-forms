import { describe, it, expect, vi } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { designFormFromBrief, MAX_DESIGNER_ATTEMPTS, type FormDesignerModel } from './llm-form-designer';

// The designer only forwards the user to the model seam; our stub models ignore it.
const fakeUser = new UserInfo();

/** A stub model that returns a fixed sequence of responses, one per attempt. */
function sequenceModel(responses: string[]): FormDesignerModel & { complete: ReturnType<typeof vi.fn> } {
  let i = 0;
  return {
    complete: vi.fn(async () => responses[Math.min(i++, responses.length - 1)]),
  };
}

const VALID_JSON = JSON.stringify({
  name: 'Event RSVP',
  pages: [
    {
      questions: [
        { type: 'Email', prompt: 'Email', isRequired: true },
        { type: 'Number', prompt: '+1 count' },
        {
          type: 'MultiChoice',
          prompt: 'Dietary restrictions',
          options: [{ label: 'Vegan' }, { label: 'None' }],
        },
      ],
    },
  ],
});

describe('designFormFromBrief', () => {
  it('returns a validated blueprint from a single good response', async () => {
    const model = sequenceModel([VALID_JSON]);
    const bp = await designFormFromBrief('5-question RSVP', model, fakeUser);
    expect(bp.name).toBe('Event RSVP');
    expect(bp.pages[0].questions).toHaveLength(3);
    expect(model.complete).toHaveBeenCalledTimes(1);
  });

  it('retries with the validation error, then succeeds', async () => {
    const model = sequenceModel(['not json at all', VALID_JSON]);
    const bp = await designFormFromBrief('RSVP', model, fakeUser);
    expect(bp.name).toBe('Event RSVP');
    expect(model.complete).toHaveBeenCalledTimes(2);
  });

  it('feeds the prior bad output back into the retry prompt', async () => {
    const model = sequenceModel(['garbage-123', VALID_JSON]);
    await designFormFromBrief('RSVP', model, fakeUser);
    const secondCallUserPrompt = model.complete.mock.calls[1][1];
    expect(secondCallUserPrompt).toContain('garbage-123');
    expect(secondCallUserPrompt).toContain('Validation error');
  });

  it('throws after MAX_DESIGNER_ATTEMPTS of invalid output', async () => {
    const model = sequenceModel(['nope']);
    await expect(designFormFromBrief('RSVP', model, fakeUser)).rejects.toThrow(/after 3 attempts/);
    expect(model.complete).toHaveBeenCalledTimes(MAX_DESIGNER_ATTEMPTS);
  });
});
