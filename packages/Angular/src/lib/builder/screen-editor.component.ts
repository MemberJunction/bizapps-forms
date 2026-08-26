/**
 * The right-hand properties panel for a selected Welcome or Ending screen.
 *
 * A sibling of `mjf-question-editor` rather than another branch inside it, for the same reason
 * screens are a separate entity: the two share almost no fields. A screen has no type, no
 * required flag, no options, no validation rule; it has a button label, a media URL and — for
 * endings — a redirect and a default flag, none of which a question has. Folding both into one
 * editor would produce a panel that is two panels wearing a trench coat.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SOCIAL_PLATFORMS,
  parseSocialLinks,
  serializeSocialLinks,
  type ConditionalRule,
  type SocialLink,
  type SocialPlatformId,
  type mjBizAppsFormsFormScreenEntity,
} from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS, FORMS_VIZ_CSS } from '../shared';
import { RulesPanelComponent } from './rules-panel.component';
import { ENDING_RULE_CARDS } from './rules-panel-model';
import type { ConditionalSourceQuestion } from './condition-sources';
import { ImageFieldComponent } from './image-field.component';
import { SettingRowComponent } from './setting-row.component';
import { isOptionalOpen, toggleOptional } from './optional-setting';
import { parseConditionalRule, serializeConditionalRule } from './json-fields';

const SCREEN_EDITOR_CSS = /* css */ `
:host { display: block; }
.se { display: flex; flex-direction: column; gap: var(--mjf-gap); }

.se-head {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding-bottom: var(--mjf-gap);
  border-bottom: 1px solid var(--mjf-rule);
}
/* The glyph takes its screen's hue; the title stays on a token. Same split as the type
   pills — the palette is measured for graphics, not for text. */
.se-head > i { color: var(--mjf-viz-fill); font-size: 1rem; }
.se-head-title { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-secondary); }

.se-section { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); padding-top: var(--mjf-gap-sm); }

.se-social { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); }
.se-social-row { display: flex; align-items: center; gap: var(--mjf-gap-sm); }
/* Fixed width so every field starts at the same place: the icon column IS the label here, and a
   ragged left edge would make seven near-identical rows harder to scan than they need to be. */
.se-social-icon {
  flex: none;
  width: 22px;
  text-align: center;
  color: var(--mj-text-secondary);
}

.se-rules-title {
  margin: 0;
  font-size: var(--mjf-meta);
  font-weight: 600;
  color: var(--mj-text-secondary);
}

`;

@Component({
  selector: 'mjf-screen-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RulesPanelComponent,
    ImageFieldComponent,
    SettingRowComponent,
  ],
  styles: [FORMS_UI_CSS, FORMS_VIZ_CSS, SCREEN_EDITOR_CSS],
  template: `
    @if (screen; as s) {
      <div class="se">
        <div class="se-head">
          <!-- The same start/finish pairing the canvas uses, in the same two colours: a plain
               flag for the screen the respondent starts on, a chequered one for where they
               finish. Kept in step with form-builder.component.html deliberately — an editor
               header that disagrees with the row that opened it reads as the wrong screen. -->
          <i
            [class]="
              (s.ScreenType === 'Welcome' ? 'mjf-viz-4 fa-solid fa-flag' : 'mjf-viz-2 fa-solid fa-flag-checkered')
            "
            aria-hidden="true"></i>
          <span class="se-head-title">{{ s.ScreenType === 'Welcome' ? 'Welcome screen' : 'Ending' }}</span>
        </div>

        <div class="se-section">
          <label class="mjf-field-label" for="se-title">Title</label>
          <input id="se-title" class="mjf-input" type="text" [value]="s.Title"
            (input)="setTitle($any($event.target).value)" />

          <label class="mjf-field-label" for="se-body">Body</label>
          <textarea id="se-body" class="mjf-input" rows="4" [value]="s.Body ?? ''"
            (input)="setBody($any($event.target).value)"></textarea>

          <label class="mjf-field-label" for="se-button">Button label</label>
          <input id="se-button" class="mjf-input" type="text" [value]="s.ButtonLabel ?? ''"
            [placeholder]="s.ScreenType === 'Welcome' ? 'Start' : 'Leave blank for no button'"
            (input)="setButtonLabel($any($event.target).value)" />

        </div>

        <mjf-image-field
          label="Image"
          [hint]="s.ScreenType === 'Welcome' ? 'Shown above the title, before the form starts.' : 'Shown above the title on this ending.'"
          [value]="s.MediaURL ?? ''"
          [formId]="s.FormID"
          ariaLabel="screen image"
          (valueChange)="setMediaURL($event)"
        />

        @if (s.ScreenType === 'Ending') {
          <mjf-setting-row
            label="Default ending"
            hint="Shown when no other ending's condition matches. Every form needs exactly one."
          >
            <button
              slot="control"
              type="button"
              class="mjf-switch"
              role="switch"
              [attr.aria-checked]="s.IsDefault"
              [class.is-on]="s.IsDefault"
              aria-label="Default ending"
              (click)="toggleDefault()"
            ></button>
          </mjf-setting-row>

          <mjf-setting-row
            label="Redirect after submit"
            hint="Send the respondent to another page instead of showing this screen."
            [open]="redirectOpen"
          >
            <button
              slot="control"
              type="button"
              class="mjf-switch"
              [class.is-on]="redirectOpen"
              role="switch"
              [attr.aria-checked]="redirectOpen"
              aria-label="Redirect after submit"
              (click)="toggleRedirect()"
            ></button>
            <input class="mjf-input" type="url" [value]="s.RedirectURL ?? ''"
              placeholder="https://…" aria-label="Redirect URL"
              (input)="setRedirectURL($any($event.target).value)" />
          </mjf-setting-row>

          <mjf-setting-row
            label="Social links"
            hint="Shown as icons under the ending message. Leave a platform blank to hide it."
            [open]="socialOpen"
          >
            <button
              slot="control"
              type="button"
              class="mjf-switch"
              [class.is-on]="socialOpen"
              role="switch"
              [attr.aria-checked]="socialOpen"
              aria-label="Social links"
              (click)="toggleSocial()"
            ></button>
            <div class="se-social">
              @for (p of platforms; track p.id) {
                <label class="se-social-row">
                  <span class="se-social-icon"><i [class]="p.icon" aria-hidden="true"></i></span>
                  <input
                    class="mjf-input"
                    type="url"
                    [value]="socialUrl(p.id)"
                    [attr.placeholder]="'https://' + p.label.toLowerCase() + '.com/…'"
                    [attr.aria-label]="p.label + ' link'"
                    (change)="setSocialUrl(p.id, $any($event.target).value)"
                  />
                </label>
              }
            </div>
          </mjf-setting-row>

          <div class="se-section">
            <p class="se-rules-title">Rules</p>
            <mjf-rules-panel
              [subjectId]="s.ID"
              [cards]="ruleCards"
              [rule]="conditionalRule"
              [sources]="conditionalSources"
              [isDisqualification]="s.IsDisqualification"
              (ruleChange)="onConditionalChange($event)"
              (disqualifyChange)="setDisqualification($event)"
            />
          </div>
        }
      </div>
    }
  `,
})
export class ScreenEditorComponent {
  @Input()
  public set screen(value: mjBizAppsFormsFormScreenEntity | null) {
    if (value?.ID !== this.current?.ID) {
      // A new screen's emptiness is not the previous screen's — start its rows closed.
      this.requested = { redirect: false, social: false };
    }
    this.current = value;
  }
  public get screen(): mjBizAppsFormsFormScreenEntity | null {
    return this.current;
  }
  private current: mjBizAppsFormsFormScreenEntity | null = null;

  /** Rows switched on but not yet filled in — see {@link isOptionalOpen}. */
  protected readonly ruleCards = ENDING_RULE_CARDS;

  private requested = { redirect: false, social: false };
  /** Every question on the form — all of them are valid sources for an ending's condition. */
  @Input() conditionalSources: ConditionalSourceQuestion[] = [];

  /** Emitted whenever a field on the screen entity changed (parent persists). */
  @Output() screenChanged = new EventEmitter<mjBizAppsFormsFormScreenEntity>();

  protected get redirectOpen(): boolean {
    return isOptionalOpen(!!this.screen?.RedirectURL, this.requested.redirect);
  }


  protected toggleRedirect(): void {
    const next = toggleOptional(!!this.screen?.RedirectURL, this.requested.redirect);
    this.requested.redirect = next.requested;
    if (next.clear) {
      this.setRedirectURL('');
    }
  }


  // --- Social links ---------------------------------------------------------

  protected readonly platforms = SOCIAL_PLATFORMS;

  protected get socialLinks(): SocialLink[] {
    return parseSocialLinks(this.screen?.SocialLinks);
  }

  protected get socialOpen(): boolean {
    return isOptionalOpen(this.socialLinks.length > 0, this.requested.social);
  }

  protected toggleSocial(): void {
    const next = toggleOptional(this.socialLinks.length > 0, this.requested.social);
    this.requested.social = next.requested;
    if (next.clear) {
      this.apply((s) => {
        s.SocialLinks = null;
      });
    }
  }

  protected socialUrl(platform: SocialPlatformId): string {
    return this.socialLinks.find((l) => l.platform === platform)?.url ?? '';
  }

  /**
   * Set (or clear) one platform's link.
   *
   * Rewrites the whole list in {@link SOCIAL_PLATFORMS} order rather than appending, so the icons
   * a respondent sees are in a stable order the author can predict from the panel they are
   * looking at, not in whichever order the fields happened to be filled.
   */
  protected setSocialUrl(platform: SocialPlatformId, url: string): void {
    const current = new Map(this.socialLinks.map((l) => [l.platform, l.url]));
    const trimmed = url.trim();
    if (trimmed === '') {
      current.delete(platform);
    } else {
      current.set(platform, trimmed);
    }
    const ordered = SOCIAL_PLATFORMS.flatMap((p) => {
      const value = current.get(p.id);
      return value ? [{ platform: p.id, url: value }] : [];
    });
    this.apply((s) => {
      s.SocialLinks = serializeSocialLinks(ordered);
    });
  }

  protected get conditionalRule(): ConditionalRule | undefined {
    return this.screen ? parseConditionalRule(this.screen.ConditionalRule) : undefined;
  }

  protected setTitle(value: string): void {
    this.apply((s) => {
      // Title is NOT NULL and is the screen's only required copy, so a cleared field falls back
      // rather than failing the save with a constraint error the author cannot see.
      s.Title = value.trim() === '' ? 'Untitled screen' : value;
    });
  }

  protected setBody(value: string): void {
    this.apply((s) => {
      s.Body = blankToNull(value);
    });
  }

  protected setButtonLabel(value: string): void {
    this.apply((s) => {
      s.ButtonLabel = blankToNull(value);
    });
  }

  protected setMediaURL(value: string): void {
    this.apply((s) => {
      s.MediaURL = blankToNull(value);
    });
  }

  protected setRedirectURL(value: string): void {
    this.apply((s) => {
      s.RedirectURL = blankToNull(value);
    });
  }

  protected toggleDefault(): void {
    this.apply((s) => {
      s.IsDefault = !s.IsDefault;
    });
  }

  /** The disqualify card was added/removed — flip the flag; the rule flows via ruleChange. */
  protected setDisqualification(on: boolean): void {
    const s = this.screen;
    if (s && s.IsDisqualification !== on) {
      s.IsDisqualification = on;
      this.screenChanged.emit(s);
    }
  }

  protected onConditionalChange(rule: ConditionalRule | undefined): void {
    this.apply((s) => {
      s.ConditionalRule = serializeConditionalRule(rule);
    });
  }

  private apply(mutate: (screen: mjBizAppsFormsFormScreenEntity) => void): void {
    if (!this.screen) {
      return;
    }
    mutate(this.screen);
    this.screenChanged.emit(this.screen);
  }
}

/** Empty input means "no value", not an empty string — these columns are nullable. */
function blankToNull(value: string): string | null {
  return value.trim() === '' ? null : value;
}
