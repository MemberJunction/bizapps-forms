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
      // PostgreSQL folds the unquoted schema name to lower case, and these rules match
      // case-sensitively — without the twin, entities discovered on PG get no prefix.
      { SchemaName: '__mj_bizappsforms', EntityNamePrefix: 'MJ_BizApps_Forms: ', EntityNameSuffix: '' },
    ],
  },

  /**
   * The ONE schema this distribution's CodeGen may generate from.
   *
   * `includeSchemas` is an opt-in positive scope: CodeGen resolves it into
   * `excludeSchemas` before metadata management and again before file generation, so
   * every schema in the database that is NOT named here is treated as excluded —
   * including schemas this repo has never heard of.
   *
   * That last part is why this is an allow-list rather than a deny-list. CodeGen runs
   * against a database that also hosts the sibling Open Apps (bizapps-common and
   * bizapps-tasks are hard `mj-app.json` dependencies, so they are always installed
   * alongside Forms) — but a real deployment holds more than that. bizapps-caliber, for
   * one, already shares a database with all three and owns `__mj_BizAppsCaliber`, which
   * no deny-list maintained here could ever have named in advance. An allow-list needs
   * no advance knowledge: anything unnamed is out of scope by construction.
   *
   * Without correct scoping, CodeGen emits entity subclasses, GraphQL resolvers, and
   * Angular form components for OTHER schemas into the Forms packages — and because
   * forms-server exports RESOLVER_PATHS that MJ's server-bootstrap merges into a single
   * type-graphql schema, the duplicate type names make MJAPI fail to start outright:
   *
   *   Error: Schema must contain uniquely named types but contains multiple
   *   types named "mjBizAppsTasksTaskActivity_".
   *
   * Forms still has legitimate cross-schema FKs (e.g. FormResponse.RespondentPersonID
   * -> MJ_BizApps_Common: People); leaving a schema out of scope only stops us
   * GENERATING its artifacts, it does not sever the relationship. Consume those entity
   * types from @mj-biz-apps/common-entities / @mj-biz-apps/tasks-entities instead.
   *
   * Requires MJ >= 5.50.0 (`includeSchemas` ships there). Guarded by
   * `npm run lint:generated`. See issue #10.
   */
  // Both cases are listed for the same reason as the rules above: on PostgreSQL the
  // physical schema is '__mj_bizappsforms', and an allow-list that names only the
  // mixed-case spelling excludes Forms' own schema from its own CodeGen run.
  includeSchemas: ['__mj_BizAppsForms', '__mj_bizappsforms'],

  /**
   * System schemas, kept explicit.
   *
   * Redundant while `includeSchemas` is set — the allow-list already puts everything
   * unnamed out of scope — but retained deliberately for two reasons: CodeGen's config
   * schema expects the key, and if `includeSchemas` were ever removed this is the
   * behaviour the repo falls back to rather than generating from the whole database.
   */
  excludeSchemas: [
    'sys', 'staging', 'dbo', '__mj',
    '__mj_BizAppsCommon', '__mj_BizAppsTasks',
    '__mj_bizappscommon', '__mj_bizappstasks',
  ],

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
      // PostgreSQL folds unquoted identifiers to lower case, so CodeGen reads the physical
      // schema names back from the database in lower case and these rules — which match
      // case-SENSITIVELY — miss. The generic '__mj' rule below then matches the '__mj'
      // PREFIX of '__mj_bizappsforms' and emits '${mjSchema}_bizappsforms', which resolves
      // to a schema that does not exist. These lower-case twins must sit above the generic
      // rule for the same greedy-match reason as the mixed-case ones.
      { schema: '__mj_bizappsforms', placeholder: '${flyway:defaultSchema}' },
      // bizapps-common had no rule at all, so the generic '__mj' rule mangled
      // '__mj_BizAppsCommon' into '${mjSchema}_BizAppsCommon' — visible in the shipped
      // T-SQL. That happens to resolve correctly on SQL Server (mjSchema is '__mj'), which
      // is why it went unnoticed; it is still a reference this repo does not control being
      // rewritten by accident. Name it explicitly, in both cases.
      { schema: '__mj_BizAppsCommon', placeholder: '${commonSchema}' },
      { schema: '__mj_bizappscommon', placeholder: '${commonSchema}' },
      { schema: '__mj', placeholder: '${mjSchema}' },
    ],
  },
};
