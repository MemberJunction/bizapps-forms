/**
 * Turning the Designer's `imagePrompt`s into pictures on the form.
 *
 * ── IMAGES ARE ENHANCEMENT AND NEVER A GATE. ─────────────────────────────────────────────────
 * No image model configured, a generation error, a storage account that does not exist, bytes that
 * fail the same validation a human upload gets — every one of those degrades one image and leaves
 * the form untouched. A picture-choice question without pictures is still a working question; a
 * form discarded because a model was unavailable is not.
 *
 * ── AND NEVER SILENT. ────────────────────────────────────────────────────────────────────────
 * Every skip is NAMED, including the overflow past {@link MAX_GENERATED_IMAGES}. An author who
 * asked for eight pictures and got six must be told which two are missing — "the AI decided six
 * was enough" is what a silent cap communicates, and it is not true.
 */
import { LogError, LogStatus } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { MAX_GENERATED_IMAGES } from './limits';
import { getGeneratedImageStore } from './generated-image-store';

/** Where one generated image belongs once it exists. */
export type ImageTarget =
  | { kind: 'option'; optionId: string }
  | { kind: 'screen'; screenId: string };

/** One picture to make, and where to put it. */
export interface ImageRequest {
  prompt: string;
  target: ImageTarget;
  /** Human-readable, for logs and degradation markers: `option "Rooftop"`, `the welcome screen`. */
  describedAs: string;
}

/**
 * How an image gets generated.
 *
 * A seam over MJ's core `Generate Image` action rather than a call to it, so the stage is testable
 * without an image model, an API key, or a bill. The production implementation resolves the model
 * from metadata — an operator pins it by activating exactly the `AIModelType='Image Generator'`
 * model they want, and no model name appears in this code.
 */
export interface ImageGenerationModel {
  /** Generate one image, returning raw bytes and their content type. */
  generate(prompt: string, contextUser: UserInfo): Promise<{ bytes: Uint8Array; contentType: string }>;
}

/** What one image stage did. */
export interface ImageStageResult {
  /** Target ids that now carry a URL, paired with it, for the caller to persist. */
  stored: Array<{ target: ImageTarget; url: string }>;
  /** Everything that did not happen, named. Entries read like `image:option "Rooftop"`. */
  degraded: string[];
}

/**
 * Generate, store and report every requested image, up to the cap.
 *
 * Sequential rather than concurrent, unlike page detail. Image generation is the most expensive
 * and most heavily rate-limited call in this pipeline, the cap keeps the total small, and nobody is
 * waiting on an individual picture — the form is already usable by the time this runs. Parallelism
 * here would buy seconds and cost a rate-limit that degrades several images at once.
 */
export async function runImageStage(
  formId: string,
  requests: readonly ImageRequest[],
  model: ImageGenerationModel,
  contextUser: UserInfo,
): Promise<ImageStageResult> {
  const result: ImageStageResult = { stored: [], degraded: [] };
  if (requests.length === 0) {
    return result;
  }

  const store = getGeneratedImageStore();
  if (!store) {
    // Named rather than silent: a host with no image store configured should be able to tell that
    // from the run's own report, not by wondering why forms never have pictures.
    const notice = 'image:no store configured on this instance';
    LogStatus(`[Forms authoring] ${notice}; skipping ${requests.length} image(s) for form ${formId}.`);
    return { stored: [], degraded: [notice] };
  }

  const { accepted, overflow } = applyCap(requests);
  result.degraded.push(...overflow);

  for (const request of accepted) {
    try {
      const generated = await model.generate(request.prompt, contextUser);
      const stored = await store.store(
        formId,
        generated.bytes,
        generated.contentType,
        fileNameFor(request),
        contextUser,
      );
      result.stored.push({ target: request.target, url: stored.url });
    } catch (error) {
      const marker = `image:${request.describedAs}`;
      LogError(
        `[Forms authoring] Could not create the image for ${request.describedAs} on form ${formId}; ` +
          `the form is unaffected. ${error instanceof Error ? error.message : String(error)}`,
      );
      result.degraded.push(marker);
    }
  }
  return result;
}

/**
 * Split the requests at the cap, naming what falls past it.
 *
 * The cap is on COST, not on taste: a brief that yields twenty picture-choice options would
 * otherwise run twenty image generations, which is slow and expensive enough to be a surprise.
 * Six is enough for a picture-choice question and a hero, which is what images are for here.
 */
function applyCap(requests: readonly ImageRequest[]): {
  accepted: ImageRequest[];
  overflow: string[];
} {
  if (requests.length <= MAX_GENERATED_IMAGES) {
    return { accepted: [...requests], overflow: [] };
  }
  return {
    accepted: requests.slice(0, MAX_GENERATED_IMAGES),
    overflow: requests
      .slice(MAX_GENERATED_IMAGES)
      .map((r) => `image:${r.describedAs} (over the ${MAX_GENERATED_IMAGES}-image limit)`),
  };
}

/**
 * A stable, human-legible file name.
 *
 * Only for legibility in a bucket listing: uniqueness comes from the storage path's own UUID
 * segment, so two options that describe themselves identically cannot overwrite each other.
 */
function fileNameFor(request: ImageRequest): string {
  const slug = request.describedAs
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || 'image'}.png`;
}

/**
 * Every image the persisted form is waiting for, in the order they should be made.
 *
 * Built from the BLUEPRINT paired with the ids the Builder minted, rather than re-read from the
 * database, because only the blueprint knows the prompts — `imagePrompt` is authoring intent and
 * is deliberately never persisted. Screens come first so that if the cap bites, a form loses
 * option pictures before it loses its hero: the welcome image is the one a respondent sees before
 * they have decided whether to start.
 */
export function collectImageRequests(source: {
  welcomeScreen?: { screenId: string; imagePrompt?: string };
  endingScreens: ReadonlyArray<{ screenId: string; title: string; imagePrompt?: string }>;
  options: ReadonlyArray<{ optionId: string; label: string; imagePrompt?: string }>;
}): ImageRequest[] {
  const requests: ImageRequest[] = [];
  if (source.welcomeScreen?.imagePrompt) {
    requests.push({
      prompt: source.welcomeScreen.imagePrompt,
      target: { kind: 'screen', screenId: source.welcomeScreen.screenId },
      describedAs: 'the welcome screen',
    });
  }
  for (const ending of source.endingScreens) {
    if (ending.imagePrompt) {
      requests.push({
        prompt: ending.imagePrompt,
        target: { kind: 'screen', screenId: ending.screenId },
        describedAs: `the "${ending.title}" ending screen`,
      });
    }
  }
  for (const option of source.options) {
    if (option.imagePrompt) {
      requests.push({
        prompt: option.imagePrompt,
        target: { kind: 'option', optionId: option.optionId },
        describedAs: `option "${option.label}"`,
      });
    }
  }
  return requests;
}
