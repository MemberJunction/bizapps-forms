import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
  designFormFromBrief,
  MAX_DESIGNER_ATTEMPTS,
  AIPromptFormDesignerModel,
  FORM_DESIGNER_PROMPT_NAME,
  type FormDesignerModel,
  type FormDesignerPromptData,
} from './llm-form-designer';

// ---- Mocks for the AIPromptRunner default-model tests --------------------------------
// We stub AIEngine (so no DB config) and AIPromptRunner (so no model call) and assert
// the default model resolves the named prompt and runs it via AIPromptParams.

const execMock = vi.fn();
const promptsRef: { value: Array<{ Name: string }> } = { value: [{ Name: FORM_DESIGNER_PROMPT_NAME }] };
const configMock = vi.fn(async () => undefined);

vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: {
    get Instance() {
      return {
        Config: configMock,
        get Prompts() {
          return promptsRef.value;
        },
      };
    },
  },
}));

vi.mock('@memberjunction/ai-prompts', () => ({
  AIPromptRunner: class {
    ExecutePrompt(params: unknown) {
      return execMock(params);
    }
  },
}));

// The designer only forwards the user to the model seam; our stub models ignore it.
const fakeUser = new UserInfo();

/** A stub model that returns a fixed sequence of responses, one per attempt. */
function sequenceModel(responses: string[]): FormDesignerModel & { design: ReturnType<typeof vi.fn> } {
  let i = 0;
  return {
    design: vi.fn(async () => responses[Math.min(i++, responses.length - 1)]),
  };
}

const VALID_BLUEPRINT = {
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
};
const VALID_JSON = JSON.stringify(VALID_BLUEPRINT);

describe('designFormFromBrief', () => {
  it('returns a validated blueprint from a single good response', async () => {
    const model = sequenceModel([VALID_JSON]);
    const bp = await designFormFromBrief('5-question RSVP', model, fakeUser);
    expect(bp.name).toBe('Event RSVP');
    expect(bp.pages[0].questions).toHaveLength(3);
    expect(model.design).toHaveBeenCalledTimes(1);
  });

  it('passes the brief as prompt data on the first attempt', async () => {
    const model = sequenceModel([VALID_JSON]);
    await designFormFromBrief('5-question RSVP', model, fakeUser);
    const firstData = model.design.mock.calls[0][0] as FormDesignerPromptData;
    expect(firstData.Brief).toBe('5-question RSVP');
    expect(firstData.ValidationError).toBeUndefined();
  });

  it('retries with the validation error, then succeeds', async () => {
    const model = sequenceModel(['not json at all', VALID_JSON]);
    const bp = await designFormFromBrief('RSVP', model, fakeUser);
    expect(bp.name).toBe('Event RSVP');
    expect(model.design).toHaveBeenCalledTimes(2);
  });

  it('feeds the prior bad output + error back via prompt data on retry', async () => {
    const model = sequenceModel(['garbage-123', VALID_JSON]);
    await designFormFromBrief('RSVP', model, fakeUser);
    const retryData = model.design.mock.calls[1][0] as FormDesignerPromptData;
    expect(retryData.Brief).toBe('RSVP');
    expect(retryData.PreviousAttempt).toBe('garbage-123');
    expect(retryData.ValidationError).toBeTruthy();
  });

  it('throws after MAX_DESIGNER_ATTEMPTS of invalid output', async () => {
    const model = sequenceModel(['nope']);
    await expect(designFormFromBrief('RSVP', model, fakeUser)).rejects.toThrow(/after 3 attempts/);
    expect(model.design).toHaveBeenCalledTimes(MAX_DESIGNER_ATTEMPTS);
  });
});

describe('AIPromptFormDesignerModel', () => {
  beforeEach(() => {
    execMock.mockReset();
    configMock.mockClear();
    promptsRef.value = [{ Name: FORM_DESIGNER_PROMPT_NAME }];
  });

  it('runs the named prompt and returns its raw JSON output', async () => {
    execMock.mockResolvedValue({ success: true, rawResult: VALID_JSON });
    const model = new AIPromptFormDesignerModel();
    const raw = await model.design({ Brief: 'an RSVP' }, fakeUser);
    expect(raw).toBe(VALID_JSON);
    // The named prompt was passed to the runner with the Brief as data.
    const params = execMock.mock.calls[0][0] as { prompt: { Name: string }; data: FormDesignerPromptData };
    expect(params.prompt.Name).toBe(FORM_DESIGNER_PROMPT_NAME);
    expect(params.data.Brief).toBe('an RSVP');
  });

  it('re-stringifies a parsed JSON result when no raw text is present', async () => {
    execMock.mockResolvedValue({ success: true, result: VALID_BLUEPRINT });
    const model = new AIPromptFormDesignerModel();
    const raw = await model.design({ Brief: 'an RSVP' }, fakeUser);
    const parsed = JSON.parse(raw) as { name: string };
    expect(parsed.name).toBe('Event RSVP');
  });

  it('throws clearly when the prompt is not found in metadata', async () => {
    promptsRef.value = [];
    const model = new AIPromptFormDesignerModel();
    await expect(model.design({ Brief: 'x' }, fakeUser)).rejects.toThrow(/was not found/);
    expect(execMock).not.toHaveBeenCalled();
  });

  it('throws when the prompt run fails (no silent fallback)', async () => {
    execMock.mockResolvedValue({ success: false, errorMessage: 'no active model' });
    const model = new AIPromptFormDesignerModel();
    await expect(model.design({ Brief: 'x' }, fakeUser)).rejects.toThrow(/no active model/);
  });
});
