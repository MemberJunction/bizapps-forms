/**
 * Image generation through MJ's own core `Generate Image` action.
 *
 * ── NO MODEL NAME IN CODE, SAME AS EVERY OTHER STAGE. ────────────────────────────────────────
 * `Model` is deliberately not passed. The core action resolves whichever
 * `AIModelType='Image Generator'` model is active plus its vendor's driver class, all from
 * metadata — so an operator picks the image model by activating exactly the one they want, and
 * changing it is a metadata operation rather than a deploy.
 *
 * ── WHY THE ACTION AND NOT `BaseImageGenerator` DIRECTLY. ────────────────────────────────────
 * Going straight to the generator would mean re-implementing the model resolution, the API-key
 * lookup and the vendor driver dispatch the action already does — and doing it differently, which
 * is how the image model an operator configured stops being the one that gets used. Running it
 * in-process through `ActionEngineServer` is the same pattern MJ's own agents use.
 */
import { ActionEngineServer } from '@memberjunction/actions';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';
import type { UserInfo } from '@memberjunction/core';
import type { ImageGenerationModel } from './image-stage';

/** MJ's core image-generation action. */
export const GENERATE_IMAGE_ACTION_NAME = 'Generate Image';

/**
 * Base64 is requested rather than a URL because the bytes have to be re-hosted anyway: a
 * provider's URL expires, and a published form has to keep rendering long after it would.
 *
 * THIS IS TRANSPORT, NOT IMAGE FORMAT. `OutputFormat` accepts only `base64` or `url`; the core
 * action exposes no way to ask for PNG over WebP, so the image type is whatever the configured
 * generator emits. That is fine because the guard is downstream and unconditional: the asset
 * pipeline runs the same `validateImage()` raster allowlist over these bytes that it runs over a
 * human upload, so an unexpected type is refused at storage rather than served to a respondent.
 * Worth stating because the obvious place to look for a format request is here, and it is not here.
 */
const OUTPUT_FORMAT = 'base64';

/** Runs the core `Generate Image` action. */
export class CoreActionImageGenerationModel implements ImageGenerationModel {
  async generate(
    prompt: string,
    contextUser: UserInfo,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const engine = ActionEngineServer.Instance;
    await engine.Config(false, contextUser);

    const action = engine.Actions.find((a) => a.Name === GENERATE_IMAGE_ACTION_NAME);
    if (!action) {
      throw new Error(
        `The core "${GENERATE_IMAGE_ACTION_NAME}" action is not installed on this MemberJunction ` +
          'instance, so forms cannot be given generated pictures.',
      );
    }

    const result = await engine.RunAction({
      Action: action,
      ContextUser: contextUser,
      Filters: [],
      Params: [
        { Name: 'Prompt', Value: prompt, Type: 'Input' },
        { Name: 'OutputFormat', Value: OUTPUT_FORMAT, Type: 'Input' },
      ],
    });

    if (!result.Success) {
      throw new Error(result.Message || 'The image model did not return an image.');
    }
    return firstImageOf(result);
  }
}

/** The generated image's bytes, or a clear error about what the action actually returned. */
function firstImageOf(result: ActionResult): { bytes: Uint8Array; contentType: string } {
  const images = findParam(result.Params, 'Images');
  const first = Array.isArray(images) ? images[0] : undefined;
  if (typeof first !== 'object' || first === null) {
    throw new Error('The image action reported success but returned no image.');
  }

  const media = first as { data?: unknown; mimeType?: unknown; type?: unknown };
  if (typeof media.data !== 'string' || media.data.length === 0) {
    // Named rather than swallowed, because the likely cause is a `url` OutputFormat somewhere and
    // "no bytes" is a much more findable complaint than an empty image on a form.
    throw new Error('The image action returned an image with no base64 data.');
  }
  return {
    bytes: decodeBase64(media.data),
    // The asset pipeline re-validates this against its own allowlist, so a wrong guess here is
    // rejected there rather than stored. PNG is what every current generator returns.
    contentType: typeof media.mimeType === 'string' ? media.mimeType : 'image/png',
  };
}

function findParam(params: readonly ActionParam[] | undefined, name: string): unknown {
  return params?.find((p) => p.Name === name)?.Value;
}

/**
 * Base64 to bytes without Node's `Buffer`.
 *
 * This package has no Node types by design (see `generated-image-store.ts`), and `atob` is
 * standard in every runtime MJ targets. The server-side store converts to a real `Buffer` when it
 * hands these to storage.
 */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
