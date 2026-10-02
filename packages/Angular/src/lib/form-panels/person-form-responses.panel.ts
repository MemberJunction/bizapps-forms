import { Component, DoCheck } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, BaseFormsModule } from '@memberjunction/ng-base-forms';
import { FORMS_UI_CSS } from '../shared';
import { FORMS_ENTITY } from '../shared/entity-names';
import {
  PERSON_FORMS_REGISTRATION,
  PERSON_FORMS_SECTION_KEY,
  SectionMountLatch,
} from './person-form-responses.model';
import { PersonFormResponsesListComponent } from './person-form-responses-list.component';

/**
 * "Forms" section on Common's Person record form (#285): every form response linked to the
 * person. The registration claims the Form Responses → People relationship, so it replaces MJ's
 * generic related-entity grid there (see the model file for why `relatedJoinField` is omitted).
 *
 * Typed over `BaseEntity`, not Common's Person entity class: only the primary key is read, and
 * that keeps forms-ng free of a dependency on `@mj-biz-apps/common-entities`.
 *
 * Mounting: the list is lazy — nothing is queried until the section is first expanded — and
 * then latched, so collapsing and re-expanding keeps it mounted instead of refetching and
 * flashing a spinner (the collapsible body hides it while collapsed). The list itself reloads on
 * Retry and on the host form's record refresh. The latch is per record: a different `Record`
 * starts lazy again.
 *
 * Default change detection, deliberately: `IsSectionExpanded` lives on the host form and can
 * change from outside this view (the section rail), which OnPush would not see; `ngDoCheck`
 * reads it on every pass.
 */
@RegisterClassEx(BaseFormPanel, {
  key: 'form-panel:People:related:FormResponses',
  metadata: PERSON_FORMS_REGISTRATION,
})
@Component({
  selector: 'mjf-person-form-responses-panel',
  standalone: true,
  imports: [BaseFormsModule, PersonFormResponsesListComponent],
  template: `
    <mj-collapsible-panel
      [SectionKey]="SectionKey"
      SectionName="Forms"
      Icon="fa-solid fa-clipboard-list"
      Variant="related-entity"
      [Form]="FormComponent"
      [FormContext]="FormContext"
      [BadgeCount]="FormComponent.GetSectionRowCount(SectionKey)"
      [DefaultExpanded]="false">
      @if (!Record.IsSaved) {
        <p class="pfr-unsaved">Save this person to see the forms they fill in.</p>
      } @else if (ListMounted) {
        <mjf-person-form-responses-list
          [PersonID]="PersonID"
          (Loaded)="OnLoaded($event)"
          (OpenResponse)="OnOpenResponse($event)">
        </mjf-person-form-responses-list>
      }
    </mj-collapsible-panel>
  `,
  styles: [
    FORMS_UI_CSS,
    `
      .pfr-unsaved {
        margin: 0;
        padding: var(--mjf-gap) var(--mjf-card-pad-sm);
        font-size: var(--mjf-meta);
        color: var(--mj-text-secondary);
      }
    `,
  ],
})
export class PersonFormResponsesPanel extends BaseFormPanel implements DoCheck {
  public readonly SectionKey = PERSON_FORMS_SECTION_KEY;

  private readonly mountLatch = new SectionMountLatch<object>();

  /** Whether the list is mounted: latched on first expansion of a saved record, per record. */
  public get ListMounted(): boolean {
    return this.mountLatch.IsMounted();
  }

  public ngDoCheck(): void {
    this.mountLatch.Observe(this.Record, this.Record.IsSaved, this.FormComponent.IsSectionExpanded(this.SectionKey));
  }

  public get PersonID(): string {
    return String(this.Record.FirstPrimaryKey.Value);
  }

  public OnLoaded(count: number): void {
    this.FormComponent.SetSectionRowCount(this.SectionKey, count);
  }

  public OnOpenResponse(responseId: string): void {
    this.FormComponent.OnFormNavigate({
      Kind: 'record',
      EntityName: FORMS_ENTITY.FormResponse,
      PrimaryKey: CompositeKey.FromID(responseId),
    });
  }
}
