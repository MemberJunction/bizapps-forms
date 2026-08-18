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
export { flattenQuestions } from './published-questions';
export { FORMS_UI_CSS, FORMS_UI_TOKENS, FORMS_UI_PRIMITIVES } from './forms-ui';
