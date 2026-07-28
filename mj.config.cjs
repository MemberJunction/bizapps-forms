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
   * and get a "MJ_BizApps_Forms: " entity-name prefix to avoid collisions with MJ core
   * and other apps. (MJ core entities use the "MJ: " prefix.)
   */
  newEntityDefaults: {
    NameRulesBySchema: [
      { SchemaName: '${mj_core_schema}', EntityNamePrefix: 'MJ: ' },
      { SchemaName: '__mj_BizAppsForms', EntityNamePrefix: 'MJ_BizApps_Forms: ', EntityNameSuffix: '' },
    ],
  },

  /**
   * Schemas this distribution's CodeGen must never touch.
   *
   * Beyond the core/system schemas, this MUST exclude the sibling Open Apps'
   * schemas. CodeGen runs against a database that also hosts bizapps-common and
   * bizapps-tasks (both are hard `mj-app.json` dependencies, so they are always
   * installed alongside Forms). Without these exclusions CodeGen emits entity
   * subclasses, GraphQL resolvers, and Angular form components for THEIR schemas
   * into the Forms packages — and because forms-server exports RESOLVER_PATHS
   * that MJ's server-bootstrap merges into a single type-graphql schema,
   * the duplicate type names make MJAPI fail to start outright:
   *
   *   Error: Schema must contain uniquely named types but contains multiple
   *   types named "mjBizAppsTasksTaskActivity_".
   *
   * Forms still has legitimate cross-schema FKs (e.g. FormResponse.RespondentPersonID
   * -> MJ_BizApps_Common: People); excluding a schema only stops us GENERATING its
   * artifacts, it does not sever the relationship. Consume those entity types from
   * @mj-biz-apps/common-entities / @mj-biz-apps/tasks-entities instead.
   *
   * Guarded by `npm run lint:generated`. See issue #10.
   */
  excludeSchemas: ['sys', 'staging', 'dbo', '__mj', '__mj_BizAppsCommon', '__mj_BizAppsTasks'],

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
