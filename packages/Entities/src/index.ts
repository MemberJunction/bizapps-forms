export * from './generated/entity_subclasses'
export * from './generated/remote_operations'
export * from './contracts'

/**
 * Forces the generated entity subclasses to be loaded so their @RegisterClass
 * decorators fire (otherwise tree-shaking can drop them). Call this once at startup.
 */
export function LoadGeneratedEntities() {
}
