/**
 * Cross-area primitives — used by the builder, the reporting dashboard and the
 * responses surface alike. Nothing Angular, nothing that does I/O.
 */
export { FORMS_ENTITY, MJ_CORE_ENTITY } from './entity-names';
export {
  CHOICE_TYPES,
  NUMERIC_TYPES,
  TEXT_TYPES,
  extractChoiceValues,
  renderAnswer,
  respondentLabel,
} from './answer-values';
export { toDate } from './runview-dates';
export {
  readActionOutput,
  readActionOutputString,
  readActionOutputStrings,
  type ClientActionResult,
} from './action-output';
export { flattenQuestions } from './published-questions';
export { FORMS_UI_CSS, FORMS_UI_TOKENS, FORMS_UI_PRIMITIVES } from './forms-ui';
export {
  FORMS_VIZ_CSS,
  FORMS_VIZ_TOKENS,
  FORMS_VIZ_PRIMITIVES,
  VIZ_SERIES_LENGTH,
  VIZ_SERIES_ROTATION,
  vizSeriesClass,
} from './forms-viz';
