export * from './generated/entity_subclasses'
export * from './generated/remote_operations'
export * from './contracts'
// The authoring blueprint is a contract too (`contracts/form-blueprint.ts`), but it is exported from
// the package root only and NOT from the `./contracts` barrel: the respondent widget bundles that
// barrel, and esbuild cannot drop zod's top-level schema construction, so listing it there would
// ship the authoring schema to every respondent. Its only consumers are server-side.
export * from './contracts/form-blueprint'
// The clone remap is authoring-only for the same reason: no respondent ever copies a form.
export * from './contracts/clone-remap'
// So is the share-link rule (slug grammar and the respondent URL): no respondent ever builds a link.
export * from './contracts/share-link'

/**
 * Forces the generated entity subclasses to be loaded so their @RegisterClass
 * decorators fire (otherwise tree-shaking can drop them). Call this once at startup.
 */
export function LoadGeneratedEntities() {
}
