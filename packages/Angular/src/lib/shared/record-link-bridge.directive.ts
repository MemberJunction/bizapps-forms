import { Directive, Input } from '@angular/core';

/**
 * Compile-time input bridge for `[mjRecordLink]` while CI lockfiles reference
 * `@memberjunction/ng-base-forms` 6.1.x prior to the 6.2 release.
 * At runtime in 6.2+, `MjRecordLinkDirective` from `BaseFormsModule` attaches to the same
 * `[mjRecordLink]` selector and provides hover preview, quick edit, and record navigation.
 */
@Directive({
  selector: '[mjRecordLink]',
  standalone: true,
})
export class FormsRecordLinkBridgeDirective {
  @Input() mjRecordLink: unknown = '';
  @Input() FieldName: string | null = null;
  @Input() EntityName: string | null = null;
  @Input() RecordID: unknown = null;
  @Input() DisplayName: string | null = null;
  @Input() HandleClick = true;
  @Input() EnablePreview = true;
}
