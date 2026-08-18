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
.se-section-title {
  margin: 0;
  font-size: var(--mjf-label);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}

.se-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mjf-gap-sm);
  padding: 10px 12px;
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface-sunken);
}
.se-toggle span { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-secondary); }

.se-hint { margin: 0; font-size: var(--mjf-label); color: var(--mj-text-muted); }
`;

@Component({
  selector: 'mjf-screen-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ConditionalRuleEditorComponent, ImageFieldComponent],
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

          <mjf-image-field
            inputId="se-media"
            label="Image"
            [value]="s.MediaURL ?? ''"
            [formId]="s.FormID"
            [hint]="s.ScreenType === 'Welcome' ? 'Shown above the title, before the form starts.' : 'Shown above the title on this ending.'"
            (valueChange)="setMediaURL($event)"
          />
        </div>

        @if (s.ScreenType === 'Ending') {
          <div class="se-section">
            <p class="se-section-title">After submit</p>
            <label class="mjf-field-label" for="se-redirect">Redirect to</label>
            <input id="se-redirect" class="mjf-input" type="url" [value]="s.RedirectURL ?? ''"
              placeholder="https://…" (input)="setRedirectURL($any($event.target).value)" />
            <p class="se-hint">When set, the respondent goes here instead of seeing this screen.</p>

            <div class="se-toggle">
              <span>Use as the default ending</span>
              <button type="button" class="mjf-switch" role="switch"
                [attr.aria-checked]="s.IsDefault"
                [class.is-on]="s.IsDefault"
                (click)="toggleDefault()"></button>
            </div>
            <p class="se-hint">Shown when no other ending's condition matches.</p>
          </div>

          <div class="se-section">
            <p class="se-section-title">Show this ending when</p>
            <mjf-conditional-rule-editor
              [rule]="conditionalRule"
              [sources]="conditionalSources"
              (ruleChange)="onConditionalChange($event)"
            />
            <p class="se-hint">
              Endings are checked in order; the first match wins. An ending with no condition is
              only reachable as the default.
            </p>
          </div>
        }
      </div>
    }
  `,
})
export class ScreenEditorComponent {
  @Input() screen: mjBizAppsFormsFormScreenEntity | null = null;
  /** Every question on the form — all of them are valid sources for an ending's condition. */
  @Input() conditionalSources: ConditionalSourceQuestion[] = [];

  /** Emitted whenever a field on the screen entity changed (parent persists). */
  @Output() screenChanged = new EventEmitter<mjBizAppsFormsFormScreenEntity>();

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
