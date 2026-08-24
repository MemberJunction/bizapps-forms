import { describe, it, expect } from 'vitest';
import { formBlueprintSchema } from './form-blueprint';
import {
  MAX_BLUEPRINT_ENDINGS,
  MAX_BLUEPRINT_OPTIONS,
  MAX_BLUEPRINT_PAGES,
  MAX_BLUEPRINT_QUESTIONS_PER_PAGE,
} from './limits';

/**
 * THE BUG THIS GUARDS. `limits.ts` capped column widths, images, retries and concurrency — every
 * per-item cost — and nothing capped COUNTS. The staged pipeline runs one detail stage per page,
 * each able to burn MAX_DESIGNER_ATTEMPTS model calls, so a vague brief answered with a 400-page
 * outline queued 1,200 prompt runs with no ceiling and no way to stop it. `PAGE_DETAIL_CONCURRENCY`
 * bounds how many run at once, not how many run.
 *
 * A rejected blueprint costs a retry and degrades to the previous stage's output, which is the
 * behaviour every other validation failure here already has.
 */
const page = (questions = 1) => ({
  title: 'Page',
  questions: Array.from({ length: questions }, (_, i) => ({ type: 'ShortText', prompt: `Q${i}` })),
});
const blueprint = (pages: number, questions = 1) => ({
  name: 'Runaway',
  pages: Array.from({ length: pages }, () => page(questions)),
});

describe('the blueprint schema bounds how much work one answer can ask for', () => {
  it('accepts a form at the page cap', () => {
    expect(formBlueprintSchema.safeParse(blueprint(MAX_BLUEPRINT_PAGES)).success).toBe(true);
  });

  it('rejects one page past it', () => {
    expect(formBlueprintSchema.safeParse(blueprint(MAX_BLUEPRINT_PAGES + 1)).success).toBe(false);
  });

  it('rejects a page carrying more questions than the cap', () => {
    const result = formBlueprintSchema.safeParse(blueprint(1, MAX_BLUEPRINT_QUESTIONS_PER_PAGE + 1));
    expect(result.success).toBe(false);
  });

  it('rejects a question offering more options than the cap', () => {
    const doc = {
      name: 'Runaway',
      pages: [
        {
          title: 'Page',
          questions: [
            {
              type: 'SingleSelect',
              prompt: 'Pick',
              options: Array.from({ length: MAX_BLUEPRINT_OPTIONS + 1 }, (_, i) => ({ label: `${i}` })),
            },
          ],
        },
      ],
    };
    expect(formBlueprintSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects more ending screens than the cap', () => {
    // `endings` lives under `screens`, not at the top level — a fixture that put it at the top
    // parsed clean and proved nothing, which is exactly the failure mode this file is about.
    const doc = {
      ...blueprint(1),
      screens: {
        endings: Array.from({ length: MAX_BLUEPRINT_ENDINGS + 1 }, (_, i) => ({
          headline: `End ${i}`,
        })),
      },
    };
    expect(formBlueprintSchema.safeParse(doc).success).toBe(false);
  });
});
