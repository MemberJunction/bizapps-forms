/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  /**
   * MemberJunction minimal distribution configuration for the Forms Open App.
   *
   * Most settings come from package defaults:
   * - Database settings → environment variables (.env)
   * - CodeGen settings → DEFAULT_CODEGEN_CONFIG (@memberjunction/codegen-lib)
   *
   * Only deployment-specific bits are specified here (output paths, build
   * commands, schema placeholders, new-entity defaults).
   */

  // ============================================================================
  // DEPLOYMENT-SPECIFIC CONFIGURATION
  // ============================================================================

  /** npm package that receives generated entity subclasses */
  entityPackageName: '@mj-biz-apps/forms-entities',

  output: [
    { type: 'SQL', directory: './SQL Scripts/generated', appendOutputCode: true },
    {
      type: 'Angular',
      directory: './packages/Angular/src/lib/generated',
      options: [{ name: 'maxComponentsPerModule', value: 20 }],
    },
    { type: 'GraphQLServer', directory: './packages/Server/src/generated' },
    { type: 'ActionSubclasses', directory: './packages/Actions/src/generated' },
    { type: 'EntitySubclasses', directory: './packages/Entities/src/generated' },
    { type: 'DBSchemaJSON', directory: './Schema Files' },
  ],

  /** Build commands run after code generation */
  commands: [
    { workingDirectory: './packages/Entities', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Actions', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Server', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Angular', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './apps/MJAPI', command: 'npm', args: ['start'], timeout: 30000, when: 'after' },
  ],

  // ============================================================================
  // OPTIONAL OVERRIDES
  // ============================================================================

  /**
   * New-entity defaults. Forms entities live in the __mj_BizAppsForms schema
   * and get a "MJ Forms: " entity-name prefix to avoid collisions with MJ core
   * and other apps. (MJ core entities use the "MJ: " prefix.)
   */
  newEntityDefaults: {
    NameRulesBySchema: [
      { SchemaName: '${mj_core_schema}', EntityNamePrefix: 'MJ: ' },
      { SchemaName: '__mj_BizAppsForms', EntityNamePrefix: 'MJ_BizApps_Forms: ', EntityNameSuffix: '' },
    ],
  },

  /** Core schemas should never be touched by this distribution's CodeGen */
  excludeSchemas: ['sys', 'staging', 'dbo', '__mj'],

  /** SQL migration output for CodeGen-produced objects */
  SQLOutput: {
    enabled: true,
    folderPath: './migrations/codegen/',
    appendToFile: false,
    convertCoreSchemaToFlywayMigrationFile: true,
    omitRecurringScriptsFromLog: false,
    schemaPlaceholders: [
      // Order matters: the more-specific app schema must come first so the
      // greedy '__mj' rule doesn't partially match '__mj_BizAppsForms'.
      { schema: '__mj_BizAppsForms', placeholder: '${flyway:defaultSchema}' },
      { schema: '__mj', placeholder: '${mjSchema}' },
    ],
  },
};
