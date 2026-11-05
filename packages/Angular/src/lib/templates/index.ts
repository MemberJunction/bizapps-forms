/**
 * Reusable form templates — the gallery and the save dialog.
 *
 * Lives beside `builder/` and `home/` rather than inside either, because both mount it: the
 * gallery is a create surface on home, and "Save as template" is a builder action. The deep copy
 * behind both is the server's (`Forms.CloneForm` / `Forms.CreateFormFromTemplate`, #303); the
 * gallery's reads are `../shared/form-catalog`.
 */
export * from './templates-gallery.component';
export * from './templates-gallery.styles';
export * from './save-as-template-dialog.component';
