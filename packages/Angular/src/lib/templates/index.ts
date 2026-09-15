/**
 * Reusable form templates — the gallery, the deep copy behind it, and the save dialog.
 *
 * Lives beside `builder/` and `home/` rather than inside either, because both mount it: the
 * gallery is a create surface on home, and "Save as template" is a builder action. A copy in
 * each would be two implementations of one deep copy, which is exactly the drift this feature
 * was added to stop.
 */
export * from './clone-remap';
export * from './form-clone.service';
export * from './form-templates.service';
export * from './templates-gallery.component';
export * from './templates-gallery.styles';
export * from './save-as-template-dialog.component';
