/**
 * Forms builder (WP-D) public surface.
 *
 * Importing this module triggers the `@RegisterClass(BaseFormComponent,
 * 'MJ_BizApps_Forms: Forms')` decorator on {@link FormBuilderComponent}, which
 * overrides the generated Form entity form with the visual builder inside
 * MJExplorer. `LoadBizAppsFormsBuilder` is a no-op marker the bootstrap can call to
 * make the dependency explicit; the static import is what actually registers.
 */
export { FormBuilderComponent } from './form-builder.component';
export { QuestionEditorComponent } from './question-editor.component';
export { DistributionManagerComponent } from './distribution-manager.component';
export { ConditionalRuleEditorComponent } from './conditional-rule-editor.component';
export { ValidationRuleEditorComponent } from './validation-rule-editor.component';
export { BuilderStateService } from './builder-state.service';
export { PublishService, type PublishResult } from './publish.service';
export { DistributionService, type CreateDistributionInput, type DistributionChannel } from './distribution.service';
export { FORMS_ENTITY } from './entity-names';
export {
  QUESTION_TYPE_CATALOG,
  questionTypeMeta,
  questionTypesInGroup,
  type QuestionTypeMeta,
  type QuestionPaletteGroup,
} from './question-type-catalog';
export { generateQrMatrix, qrMatrixToSvg, textToQrSvg, type QrMatrix } from './qr-code';
export { buildPublishedDefinition } from './snapshot-builder';
export { publicUrl, embedSnippet, slugify } from './distribution-links';
export type { FormTree, PageNode, QuestionNode } from './builder-models';

import './form-builder.component';

/** Ensures the builder's class registrations fire (static import above does the work). */
export function LoadBizAppsFormsBuilder(): void {
  // no-op — the static import of form-builder.component registers the override.
}
