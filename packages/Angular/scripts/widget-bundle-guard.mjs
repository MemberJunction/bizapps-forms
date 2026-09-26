/**
 * The respondent-bundle postcondition (#245): which of esbuild's bundled inputs must never reach
 * `<mj-form>`. Kept apart from `build-widget.mjs` so the rule can be exercised without running a
 * build; the build script owns the reporting and the exit code.
 */

/**
 * Inputs that must never reach the respondent bundle (#245). The widget runs on anonymous
 * visitors' phones, so every byte is download + parse time on a slow device. These all arrive the
 * same way — through the `@mj-biz-apps/forms-entities` barrel, whose generated entity subclasses
 * carry `@RegisterClass` side effects that esbuild must keep — so the fix is always the same:
 * import from `@mj-biz-apps/forms-entities/contracts` instead.
 */
const SERVER_ONLY_INPUTS = [
  // Any MemberJunction package: MJCore, MJGlobal, sql-dialect… — the entity runtime, never
  // needed to render or submit a form.
  { label: '@memberjunction/*', pattern: /node_modules\/@memberjunction\// },
  // Arrives with MJCore (it parses expressions); its presence alone means the barrel leaked.
  { label: 'acorn', pattern: /node_modules\/acorn\// },
  // The Entities generated modules themselves: the `entity_subclasses` barrel and the
  // per-schema `entities/<schema>` module it re-exports (MJ 6.1 layout). Matched by path
  // fragment, not `node_modules/`, because the workspace symlink resolves them to
  // `packages/Entities/dist/…`.
  {
    label: 'forms-entities generated subclasses',
    pattern: /\/generated\/(entity_subclasses|entities\/)/,
  },
];

/**
 * Names the package an esbuild input path belongs to (the segment after its LAST
 * `node_modules/`), so the failure groups files by what to go and remove rather than listing
 * hundreds of paths one by one.
 */
function packageOfInput(inputPath) {
  const marker = 'node_modules/';
  const at = inputPath.lastIndexOf(marker);
  if (at < 0) return inputPath;
  const parts = inputPath.slice(at + marker.length).split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

/**
 * The bundled inputs that break the rule, grouped as `"<package> [<rule label>]"` → input paths.
 * Empty when the bundle is clean.
 * @param {string[]} inputPaths keys of esbuild's `metafile.inputs`
 * @returns {Map<string, string[]>}
 */
export function findServerOnlyInputs(inputPaths) {
  const offendersByPackage = new Map();
  for (const inputPath of inputPaths) {
    const hit = SERVER_ONLY_INPUTS.find((entry) => entry.pattern.test(inputPath));
    if (!hit) continue;
    const key = `${packageOfInput(inputPath)} [${hit.label}]`;
    offendersByPackage.set(key, [...(offendersByPackage.get(key) ?? []), inputPath]);
  }
  return offendersByPackage;
}
