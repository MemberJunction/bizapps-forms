/**
 * The ending `Forms.SaveResponse` chose, as the widget's screen component renders it (#303 Task 10c).
 *
 * The live widget never holds an ending screen: the respondent projection carries none (#302), so
 * which screen a respondent lands on — a knockout's, a score band's, the default — arrives in the save
 * result. This turns that result into the `PublishedFormScreen` shape `<mjf-form-screen>` already
 * renders for a welcome screen and for Preview's locally resolved endings, so there is one renderer
 * for every screen.
 *
 * Pure and framework-free.
 */
import type { FormsRespondentEnding } from '@mj-biz-apps/forms-entities';
import {
  apiBaseOf,
  resolveAssetUrl,
  socialPlatform,
  type PublishedFormScreen,
  type SocialLink,
} from '@mj-biz-apps/forms-entities/contracts';

/**
 * The screen for a server-chosen ending.
 *
 * `MediaURL` may be a stored `/forms/asset/<id>` reference, so it is resolved against THIS widget's
 * API base like every other asset it renders (#270). A social link whose platform this bundle cannot
 * draw is dropped, as `<mjf-form-screen>` would drop it anyway. The ending's redirect is not copied:
 * the result's own `RedirectURL` (the ending's, else the form-wide fallback) is the one the widget
 * follows.
 */
export function endingScreenFrom(ending: FormsRespondentEnding, graphqlUrl: string): PublishedFormScreen {
  const screen: PublishedFormScreen = {
    id: ending.ID,
    screenType: 'Ending',
    title: ending.Title,
    displayOrder: 0,
    isDisqualification: ending.IsDisqualification,
    socialLinks: ending.SocialLinks.flatMap((link): SocialLink[] => {
      const platform = socialPlatform(link.Platform);
      return platform ? [{ platform: platform.id, url: link.URL }] : [];
    }),
  };
  if (ending.Body !== null) {
    screen.body = ending.Body;
  }
  if (ending.ButtonLabel !== null) {
    screen.buttonLabel = ending.ButtonLabel;
  }
  if (ending.MediaURL !== null) {
    screen.mediaURL = resolveAssetUrl(ending.MediaURL, apiBaseOf(graphqlUrl));
  }
  return screen;
}
