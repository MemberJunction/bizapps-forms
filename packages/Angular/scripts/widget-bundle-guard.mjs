/**
 * The respondent-bundle postcondition (#245): which of esbuild's bundled inputs must never reach
 * `<mj-form>`. Kept apart from `build-widget.mjs` so the rule can be exercised without running a
 * build; the build script owns the reporting and the exit code.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Inputs that must never reach the respondent bundle (#245). The widget runs on anonymous
 * visitors' phones, so every byte is download + parse time on a slow device. These all arrive the
 * same way — through the `@mj-biz-apps/forms-entities` barrel, whose generated entity subclasses
 * carry `@RegisterClass` side effects that esbuild must keep — so the fix is always the same:
 * import from `@mj-biz-apps/forms-entities/contracts` instead.
 *
 * Rules match on the package that OWNS an input (see `createPackageNameResolver`), never on the
 * shape of its path: the same MJCore file is `node_modules/@memberjunction/core/…` in a store
 * install and `MJ/packages/MJCore/…` in the mj-dev workspace, and a path rule that knew only the
 * first passed 966 KB of MJ code in the second.
 */
const SERVER_ONLY_INPUTS = [
  // Any MemberJunction package: MJCore, MJGlobal, sql-dialect… — the entity runtime, never
  // needed to render or submit a form.
  { label: '@memberjunction/*', matches: (name) => name?.startsWith('@memberjunction/') === true },
  // Arrives with MJCore (it parses expressions); its presence alone means the barrel leaked.
  { label: 'acorn', matches: (name) => name === 'acorn' },
  // The Entities generated modules themselves: the `entity_subclasses` barrel and the
  // per-schema `entities/<schema>` module it re-exports (MJ 6.1 layout). This one rule needs the
  // path as well as the package, because the contract the widget DOES import lives in the same
  // package, one directory over.
  {
    label: 'forms-entities generated subclasses',
    matches: (name, inputPath) =>
      name === '@mj-biz-apps/forms-entities' && /\/generated\/(entity_subclasses|entities\/)/.test(inputPath),
  },
];

/**
 * The bundled inputs that break the rule, grouped as `"<package> [<rule label>]"` → input paths,
 * so a failure lists what to go and remove rather than hundreds of paths one by one. Empty when
 * the bundle is clean.
 * @param {string[]} inputPaths keys of esbuild's `metafile.inputs`
 * @param {(inputPath: string) => string | undefined} packageNameOf see `createPackageNameResolver`
 * @returns {Map<string, string[]>}
 */
export function findServerOnlyInputs(inputPaths, packageNameOf) {
  const offendersByPackage = new Map();
  for (const inputPath of inputPaths) {
    const name = packageNameOf(inputPath);
    const hit = SERVER_ONLY_INPUTS.find((entry) => entry.matches(name, inputPath));
    if (!hit) continue;
    const key = `${name} [${hit.label}]`;
    offendersByPackage.set(key, [...(offendersByPackage.get(key) ?? []), inputPath]);
  }
  return offendersByPackage;
}

/**
 * Code that is not server-only but must still never SHIP in `<mj-form>` (#303 Task 10c fix round 1).
 * The projection BUILDER is the server's job (`Forms.GetRespondentForm` serves its output); the widget
 * parses the result with the schema in `respondent-definition`, never builds one. The development
 * mock built one in the browser, which is how the builder got onto every respondent's phone.
 *
 * Unlike {@link SERVER_ONLY_INPUTS} these live in packages the widget DOES import — the contracts
 * barrel re-exports the builder — so esbuild reads them on every build and tree-shakes them away. The
 * rule is therefore judged on the output: an input counts only when some of its bytes were bundled.
 */
const DEV_ONLY_CODE = [
  {
    label: 'respondent projection builder',
    matches: (name, inputPath) => name === '@mj-biz-apps/forms-entities' && /\/contracts\/respondent-projection\.[jt]s$/.test(inputPath),
  },
  {
    label: 'development mock transport',
    matches: (name, inputPath) =>
      name === '@mj-biz-apps/forms-ng' && /\/widget\/api\/(forms-api\.mock\.service|mock-form\.data)\.[jt]s$/.test(inputPath),
  },
];

/**
 * The bundled inputs that carry development-only code, grouped like {@link findServerOnlyInputs}.
 * @param {Record<string, { bytesInOutput: number }>} outputInputs `metafile.outputs[<bundle>].inputs`
 * @param {(inputPath: string) => string | undefined} packageNameOf see `createPackageNameResolver`
 * @returns {Map<string, string[]>}
 */
export function findDevOnlyCode(outputInputs, packageNameOf) {
  const offenders = new Map();
  for (const [inputPath, { bytesInOutput }] of Object.entries(outputInputs)) {
    if (!(bytesInOutput > 0)) continue;
    const name = packageNameOf(inputPath);
    const hit = DEV_ONLY_CODE.find((entry) => entry.matches(name, inputPath));
    if (!hit) continue;
    const key = `${name} [${hit.label}]`;
    offenders.set(key, [...(offenders.get(key) ?? []), inputPath]);
  }
  return offenders;
}

/**
 * Returns a function naming the npm package that owns an esbuild input path: the `name` of the
 * nearest `package.json` above it, skipping the nameless `{ "type": "module" }` stubs many
 * packages keep inside `dist/`. Identity comes from the package itself, not from the path's
 * shape, because the shape depends on how dependencies were installed (a store install puts
 * everything under `node_modules/<name>/`; the mj-dev workspace links `@memberjunction/*` to
 * `MJ/packages/<Dir>/`, whose directory is not even named after the package). Lookups are cached
 * per directory; a bundle has hundreds of inputs from a few dozen packages.
 * @param {string} absWorkingDir the directory esbuild's metafile paths are relative to
 * @returns {(inputPath: string) => string | undefined}
 */
export function createPackageNameResolver(absWorkingDir) {
  const nameByDir = new Map();
  const nameOwning = (dir) => {
    if (nameByDir.has(dir)) return nameByDir.get(dir);
    const manifest = join(dir, 'package.json');
    const own = existsSync(manifest) ? readManifestName(manifest) : undefined;
    const parent = dirname(dir);
    const name = own ?? (parent === dir ? undefined : nameOwning(parent));
    nameByDir.set(dir, name);
    return name;
  };
  return (inputPath) => nameOwning(dirname(resolve(absWorkingDir, inputPath)));
}

/** The `name` of one package.json; a manifest that will not parse fails naming its path. */
function readManifestName(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')).name;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    throw new Error(`[build:widget] Cannot read the package name from ${manifestPath}: ${err.message}`);
  }
}
