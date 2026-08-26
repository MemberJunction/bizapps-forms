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
export { DesignPanelComponent } from './design-panel.component';
export { FormPreviewStageComponent } from './form-preview-stage.component';
export { screenChips, type ScreenChip } from './screen-strip';
export { ColorPickerComponent } from './color-picker.component';
export {
  PRESET_SWATCHES,
  hexToHsv,
  hsvToHex,
  isCompleteHex,
  normalizeHexInput,
  type Hsv,
} from './color-model';
export { DesignStateService, type BrandEdit } from './design-state.service';
export {
  BRAND_TOKENS,
  serializeCssVariables,
  toStyleTokens,
  readBrandToken,
  withBrandToken,
} from './style-tokens';
export { ImageFieldComponent } from './image-field.component';
export { ImagePickerDialogComponent } from './image-picker-dialog.component';
export {
  ACCEPTED_IMAGE_TYPES,
  ACCEPT_ATTRIBUTE,
  ACCEPTED_FORMATS_LABEL,
  MAX_SIZE_LABEL,
  isAcceptedType,
} from './image-formats';
export {
  FormAssetService,
  buildAssetFormData,
  parseAssetResponse,
  assetErrorMessage,
  type UploadedAsset,
} from './form-asset.service';
export { resolveApiOrigin, resolveApiToken } from '../shared/mj-api-origin';
export { ConditionalRuleEditorComponent } from './conditional-rule-editor.component';
export { RuleEditorDialogComponent } from './rule-editor-dialog.component';
export { RulesPanelComponent } from './rules-panel.component';
export { LogicEditorComponent } from './logic-editor.component';
export {
  addJumpRule,
  canAddJumpRule,
  emptyLogicDraft,
  isCommittableJump,
  isLogicDraftDirty,
  jumpRules,
  logicDraftOf,
  moveJumpRule,
  removeJumpRule,
  ruleFromLogicDraft,
  updateJumpRule,
  type JumpDraft,
  type LogicDraft,
} from './logic-draft';
export {
  groupedJumpTargets,
  jumpTargetOptions,
  storedTargetLabel,
  targetFromValue,
  targetValue,
  type JumpDestination,
  type JumpTargetGroup,
  type JumpTargetOption,
} from './jump-target-options';
export {
  collectRuleEntries,
  ruleBadgesFor,
  type RuleBadge,
  type RuleEntry,
  type RuleInventoryForm,
  type RuleInventoryItem,
  type RuleInventoryPage,
  type RuleItemKind,
} from './rules-inventory';
export { PageEditorComponent } from './page-editor.component';
export { ValidationRuleEditorComponent } from './validation-rule-editor.component';
export { BuilderStateService } from './builder-state.service';
export {
  NOTHING_SELECTED,
  clearIfQuestion,
  clearIfScreen,
  questionId,
  screenId,
  selectQuestion,
  selectScreen,
  type BuilderSelection,
} from './builder-selection';
export { PublishService, type PublishResult } from './publish.service';
export {
  DistributionService,
  type CreateDistributionInput,
  type DistributionChannel,
  type DistributionListResult,
  type MutationOutcome,
} from './distribution.service';
export {
  autoShareName,
  shareState,
  type ShareLinkFacts,
  type ShareState,
  type ShareStateKind,
  type ShareStateTone,
} from './share-state';
export { fromLocalInputValue, toLocalInputValue } from './local-datetime';
export {
  QUESTION_TYPE_CATALOG,
  questionTypeMeta,
  questionGroupColorClass,
  questionTypeColorClass,
  questionTypesInGroup,
  type QuestionTypeMeta,
  type QuestionPaletteGroup,
} from './question-type-catalog';
export { generateQrMatrix, qrMatrixToSvg, textToQrSvg, type QrMatrix } from './qr-code';
export { isValidReorder } from './reorder';
export { buildPublishedDefinition } from './snapshot-builder';
export { publicUrl, embedSnippet, slugify } from './distribution-links';
export type { FormTree, PageNode, QuestionNode } from './builder-models';

import './form-builder.component';

/** Ensures the builder's class registrations fire (static import above does the work). */
export function LoadBizAppsFormsBuilder(): void {
  // no-op — the static import of form-builder.component registers the override.
}
