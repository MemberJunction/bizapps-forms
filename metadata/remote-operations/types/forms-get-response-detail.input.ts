/**
 * Input for `Forms.GetResponseDetail`: one response with everything its detail view shows — its
 * stored answers, the files behind file answers, the automation runs it triggered and the
 * business records those wrote. Replaces `ResponsesDataService.loadResponseDetail` and the
 * definition reads beside it.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsGetResponseDetailInput {
    /** The `MJ_BizApps_Forms: Form Responses` row. */
    ResponseID: string;
    /**
     * The version whose questions label the answers. Omitted or `null`: the version the response
     * was submitted against (the Form Response record view's choice). The Responses tab and the
     * dashboard pass the form's Published version so every response reads against one set of labels.
     */
    LabelFormVersionID?: string | null;
}
