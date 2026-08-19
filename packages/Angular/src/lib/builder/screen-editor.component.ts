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
import type {
  ConditionalRule,
  mjBizAppsFormsFormScreenEntity,
} from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import {
  ConditionalRuleEditorComponent,
  type ConditionalSourceQuestion,
} from './conditional-rule-editor.component';
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
.se-head-title { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-secondary); }

.se-section { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); padding-top: var(--mjf-gap-sm); }

`;

@Component({
  selector: 'mjf-screen-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ConditionalRuleEditorComponent,
    ImageFieldComponent,
    SettingRowComponent,
  ],
  styles: [FORMS_UI_CSS, SCREEN_EDITOR_CSS],
  template: `
    @if (screen; as s) {
      <div class="se">
        <div class="se-head">
          <i [class]="s.ScreenType === 'Welcome' ? 'fa-solid fa-door-open' : 'fa-solid fa-flag-checkered'" aria-hidden="true"></i>
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
            label="Show only if"
            hint="Endings are checked in order and the first match wins. One with no condition is only reachable as the default."
            [open]="conditionalOpen"
          >
            <button
              slot="control"
              type="button"
              class="mjf-switch"
              [class.is-on]="conditionalOpen"
              role="switch"
              [attr.aria-checked]="conditionalOpen"
              aria-label="Show only if"
              (click)="toggleConditional()"
            ></button>
            <mjf-conditional-rule-editor
              [rule]="conditionalRule"
              [sources]="conditionalSources"
              (ruleChange)="onConditionalChange($event)"
            />
          </mjf-setting-row>
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
      this.requested = { redirect: false, conditional: false };
    }
    this.current = value;
  }
  public get screen(): mjBizAppsFormsFormScreenEntity | null {
    return this.current;
  }
  private current: mjBizAppsFormsFormScreenEntity | null = null;

  /** Rows switched on but not yet filled in — see {@link isOptionalOpen}. */
  private requested = { redirect: false, conditional: false };
  /** Every question on the form — all of them are valid sources for an ending's condition. */
  @Input() conditionalSources: ConditionalSourceQuestion[] = [];

  /** Emitted whenever a field on the screen entity changed (parent persists). */
  @Output() screenChanged = new EventEmitter<mjBizAppsFormsFormScreenEntity>();

  protected get redirectOpen(): boolean {
    return isOptionalOpen(!!this.screen?.RedirectURL, this.requested.redirect);
  }

  protected get conditionalOpen(): boolean {
    return isOptionalOpen(!!this.conditionalRule, this.requested.conditional);
  }

  protected toggleRedirect(): void {
    const next = toggleOptional(!!this.screen?.RedirectURL, this.requested.redirect);
    this.requested.redirect = next.requested;
    if (next.clear) {
      this.setRedirectURL('');
    }
  }

  protected toggleConditional(): void {
    const next = toggleOptional(!!this.conditionalRule, this.requested.conditional);
    this.requested.conditional = next.requested;
    if (next.clear) {
      this.onConditionalChange(undefined);
    }
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
