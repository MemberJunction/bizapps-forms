/**
 * Input for `Forms.CreateFormFromTemplate`.
 *
 * Exactly one source: a SAVED template (a form row with `IsTemplate = 1`) or a STARTER blueprint
 * from the built-in gallery. The union makes "both" and "neither" unrepresentable to a typed caller;
 * the server still refuses them, because the wire is JSON.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export type FormsCreateFormFromTemplateInput =
    | {
          /** A saved template's form id. */
          TemplateFormID: string;
          TemplateKey?: never;
          /** Name for the new form. Omitted or blank: the template's name. */
          Name?: string;
      }
    | {
          TemplateFormID?: never;
          /** A starter gallery key (`STARTER_TEMPLATE_KEYS` in the contracts). Unknown keys are refused. */
          TemplateKey: string;
          /** Name for the new form. Omitted or blank: the starter's name. */
          Name?: string;
      };
