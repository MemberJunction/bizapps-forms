#!/usr/bin/env node
/**
 * Keeps `docs/help/**` true to the product it describes — and, in one place, the product true to
 * `docs/help/**`. See {@link HELP_LINKS_FILE} for that fourth check and why it is not optional.
 *
 * ── WHY A BOLD SPAN IS A CHECKABLE CLAIM ────────────────────────────────────────────────────────
 * Help documentation does not fail on the day it ships. It fails eighteen months later, when
 * somebody renames a button and nobody remembers that four articles quoted the old name. The reader
 * is then hunting for a control that does not exist, and there is no way to discover that except by
 * reading every article against the running product — which nobody will ever do again.
 *
 * Prose cannot be checked by a machine. A quoted label CAN be, if a machine can tell which words
 * are quoted labels. So `docs/help/STYLE.md` §6 reserves **bold** for exactly one meaning — "this
 * text is painted on the reader's screen" — emphasis uses italics, and nothing else may be bold.
 * That convention is what turns a style rule into an assertion, and this script is what makes the
 * assertion cost something: every bold span must appear in the product's own source, give or take
 * where two unrelated editors happened to wrap a line.
 *
 * The payoff is the direction people do not expect. Renaming a button turns the build red on the
 * pull request that renames it, handing that author the list of articles to fix while it is still
 * one edit — instead of leaving a reader to find it. Do not weaken the rule to make a rename
 * quieter; the noise IS the feature.
 *
 * The matching failure mode is the one to guard against here: a span this script does not SEE is a
 * label nobody will ever verify again, and nothing says so. Every parsing decision below therefore
 * errs towards seeing more, and `check-help-docs.spec.mjs` pins each one.
 *
 * ── WHAT IS NOT CHECKED, AND WHY THAT IS NOT AN EXEMPTION ───────────────────────────────────────
 * Fenced code, inline code and HTML comments are stripped before anything is extracted. The rule is
 * not "these files are special" — it is that NONE OF IT IS RENDERED, so none of it is a claim about
 * the product. STYLE.md relies on this to show a failing example (`**the publish button**`) without
 * failing, and `_sidebar.md` relies on it to park the planned running order of articles not yet
 * written. There is no per-file exemption anywhere in this script, deliberately: an exempt file is
 * where the one dead navigation link would hide, and a knowingly-red gate trains everyone to ignore
 * a red gate.
 *
 * ── NODE STDLIB ONLY ────────────────────────────────────────────────────────────────────────────
 * Like every other gate in `scripts/`: no dependencies, so a dependency problem can never be the
 * reason nobody finds out the gate did not run. It is wired into `changes_and_migrations` rather
 * than `build-and-test` for the same family of reasons — see the comment beside the step in
 * `.github/workflows/changes.yml`.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');
const HELP_DIR = path.join(REPO_ROOT, 'docs', 'help');
const ALLOWLIST_FILE = path.join(HELP_DIR, '.ui-strings-allow.txt');
/**
 * Where on-screen text lives. Entities is not an afterthought: `contracts/form-screens.ts` holds the
 * default confirmation a respondent reads after submitting, `contracts/answer-format.ts` holds every
 * built-in validation message, and `contracts/starter-templates.ts` holds the template names in the
 * gallery. Leaving it out did not fail loudly — it just meant none of that copy could be bolded
 * anywhere in the help centre, which is most of what the respondent-facing articles are made of.
 */
const SOURCE_DIRS = [
    path.join(REPO_ROOT, 'packages', 'Angular', 'src'),
    path.join(REPO_ROOT, 'packages', 'Server', 'src'),
    path.join(REPO_ROOT, 'packages', 'Entities', 'src'),
];
const SOURCE_EXTENSIONS = ['.ts', '.html'];

/**
 * The one file in the product that quotes the DOCUMENTATION, rather than the other way round.
 *
 * Everything else here checks documentation against the product. This is the return direction, and
 * it was the open half: `help-links.ts` holds the five URLs the in-product empty states send a stuck
 * reader to, and nothing verified that the article each one names still exists. Rename an article
 * and you get five silent 404s, delivered at exactly the moment somebody is stuck — the worst moment
 * this repository has to offer, and the one place nobody would think to look.
 */
const HELP_LINKS_FILE = path.join(
    REPO_ROOT, 'packages', 'Angular', 'src', 'lib', 'shared', 'help-links.ts',
);

/**
 * Files that are NOT the product, excluded from the haystack.
 *
 * Extension alone is not enough, and the gap was the silent kind. A `.spec.ts` is still TypeScript,
 * so a bold span matching nothing but a leftover string in an old assertion or a mock verified
 * clean — a help article quoting a button that no longer exists anywhere a reader can see, with the
 * gate reporting green. There are 208 spec files under these roots; they were 40% of the haystack.
 *
 * Deliberately the same list as `EXCLUDE_PATH_FRAGMENTS` in scripts/check-ui-tokens.mjs, so that
 * "which files are real UI source" has ONE answer in this repository rather than two that drift.
 * Two documented divergences, both load-bearing:
 *
 *   - `/generated/` is EXCLUDED there and KEPT here. That gate refuses to judge CodeGen output it
 *     cannot ask anyone to fix; this one is asking a different question, and generated Angular form
 *     code is real shipped UI whose labels a reader genuinely sees.
 *   - `/__tests__/` is here and not there, because a test helper need not be named `.spec.ts`:
 *     packages/Server/src/public-submit/__tests__/fakes.ts is a mock and nothing else. The sibling
 *     gate scans only packages/Angular/src, which has no such directory, so it never met the case.
 *
 * `/node_modules/` and `/dist/` match nothing under these roots today. They are kept for parity
 * with the sibling list: an inert pattern costs nothing and a build artefact appearing under `src/`
 * later would otherwise be read as product source.
 */
const EXCLUDE_PATH_FRAGMENTS = ['/node_modules/', '/dist/', '/__tests__/', '.spec.ts', '.test.ts'];

/**
 * Joins source files. Not `\n`: the haystack is whitespace-normalised before matching, which would
 * turn a newline into a space and let the tail of one file plus the head of the next read as one
 * continuous label. NUL is not matched by `\s`, so it survives normalisation, and no label can
 * contain it.
 */
const FILE_SEPARATOR = `\n${String.fromCharCode(0)}\n`;

const SIDEBAR = '_sidebar.md';

/** Articles that are not navigation targets: the landing page, the style guide, and the partials. */
function isNavigable(relativePath) {
    const name = path.basename(relativePath);
    return name !== 'README.md' && name !== 'STYLE.md' && !name.startsWith('_');
}

// ── Stripping what the reader never sees ────────────────────────────────────────────────────────
// Everything here blanks its match IN PLACE, one space per character, keeping newlines. Line numbers
// downstream therefore stay the article's own line numbers, and no two tokens can be fused into a
// third by the removal.

const blankOut = (text) => text.replace(/[^\n]/g, ' ');

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
/** A run of backticks, closed by a run of the same length — not by a longer one. */
const INLINE_CODE = /(`+)[\s\S]*?\1(?!`)/g;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * Blanks fenced code blocks. Line-based rather than one regex, because a fence closes only on a run
 * of the same character at least as long as the one that opened it — the case STYLE.md §5 exercises
 * with a ````markdown fence wrapping a ``` example.
 */
function blankFencedCode(markdown) {
    const lines = markdown.split('\n');
    let fence = null;
    return lines
        .map((line) => {
            if (fence === null) {
                const open = FENCE_OPEN.exec(line);
                // A backtick fence's info string may not contain a backtick (CommonMark), which is
                // what stops `` `a` `` on its own line being read as an opening fence.
                if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
                    fence = open[1];
                    return blankOut(line);
                }
                return line;
            }
            const close = FENCE_CLOSE.exec(line);
            if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
            return blankOut(line);
        })
        .join('\n');
}

/**
 * The single entry point for "what would a reader actually see". Comments first, so a commented-out
 * fence cannot leave a fence open; inline code last, so an unbalanced backtick inside a fenced block
 * cannot swallow the rest of the file.
 */
function stripUnrendered(markdown) {
    const withoutComments = markdown.replace(HTML_COMMENT, blankOut);
    const withoutFences = blankFencedCode(withoutComments);
    return withoutFences.replace(INLINE_CODE, blankOut);
}

function lineNumberAt(text, index) {
    let line = 1;
    for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
    return line;
}

// ── extractBoldSpans ────────────────────────────────────────────────────────────────────────────
// Both markers, because both render bold and the gate is only as good as what it sees. The
// underscore form additionally refuses to start or end inside a word, matching CommonMark — without
// that, `V202609071200__v0.3.0__Widen` reads as a bold span and the gate starts crying wolf.
//
// The lookarounds are CommonMark's flanking rule in miniature: `**` opens only when followed by a
// non-space and closes only when preceded by one. The blank-line rejection below bounds a span to
// one paragraph, so a single unmatched `**` cannot swallow an entire article into one absurd span.

const BOLD_MARKERS = [
    /\*\*(?=\S)[\s\S]*?(?<=\S)\*\*/g,
    /(?<!\w)__(?=\S)[\s\S]*?(?<=\S)__(?!\w)/g,
];
const BLANK_LINE = /\n[ \t]*\n/;

/** Pure. Every bold span a reader would see, with the line it starts on, in document order. */
export function extractBoldSpans(markdown) {
    const visible = stripUnrendered(markdown);
    const found = [];
    for (const marker of BOLD_MARKERS) {
        marker.lastIndex = 0;
        let match = marker.exec(visible);
        while (match !== null) {
            const inner = match[0].slice(2, -2);
            if (BLANK_LINE.test(inner)) {
                // Not a span. Resume just after the opening marker rather than after the whole
                // match, or a real span nested in the rejected range is skipped silently.
                marker.lastIndex = match.index + 2;
            } else {
                found.push({ index: match.index, text: inner });
            }
            match = marker.exec(visible);
        }
    }
    return found
        .sort((a, b) => a.index - b.index)
        .map(({ index, text }) => ({ text, line: lineNumberAt(visible, index) }));
}

// ── extractLinks ────────────────────────────────────────────────────────────────────────────────

const MARKDOWN_LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Pure. Every link or image target that has to resolve on disk. External targets are dropped. */
export function extractLinks(markdown) {
    const visible = stripUnrendered(markdown);
    const links = [];
    MARKDOWN_LINK.lastIndex = 0;
    let match = MARKDOWN_LINK.exec(visible);
    while (match !== null) {
        const raw = match[1];
        const isExternal = HAS_SCHEME.test(raw) || raw.startsWith('//');
        const target = raw.split('#')[0];
        if (!isExternal && target !== '') {
            links.push({ target, line: lineNumberAt(visible, match.index) });
        }
        match = MARKDOWN_LINK.exec(visible);
    }
    return links;
}

// ── extractHelpLinkPaths ────────────────────────────────────────────────────────────────────────

/**
 * A help-centre route fragment: `#/`, then the article's path on disk with its `.md` dropped.
 *
 * Deliberately narrow about what a path may contain — letters, digits, `-`, `_`, `.` and `/` — so
 * the closing backtick, quote or space of whatever literal the URL sits in ends the match. Nothing
 * else about the surrounding TypeScript is parsed, which is why this stays a pure function over a
 * string rather than something that has to know about template literals.
 */
const HELP_ROUTE_FRAGMENT = /#\/([A-Za-z0-9._/-]+)/g;

/**
 * Pure. The links whose article does not exist. `articleExists` is injected so the whole decision is
 * testable without a filesystem — the one thing that would otherwise make this half untestable.
 */
export function findBrokenHelpLinks({ links, articleExists }) {
    return links.filter((link) => !articleExists(`${link.path}.md`));
}

/**
 * Pure. Every help-centre article path the product links to, with the line it sits on.
 *
 * Comments are NOT stripped, on purpose and unlike the markdown side. A route written in a comment
 * — `help-links.ts` explains its URL shape using `…/help/#/build/logic` — is a claim about an
 * article that can rot exactly like a rendered one, and a stale comment is the failure this whole
 * gate exists to prevent. Checking it costs nothing and misleads nobody.
 *
 * Duplicates are kept: two links to the same renamed article are two edits to make.
 */
export function extractHelpLinkPaths(source) {
    const found = [];
    HELP_ROUTE_FRAGMENT.lastIndex = 0;
    let match = HELP_ROUTE_FRAGMENT.exec(source);
    while (match !== null) {
        found.push({ path: match[1], line: lineNumberAt(source, match.index) });
        match = HELP_ROUTE_FRAGMENT.exec(source);
    }
    return found;
}

// ── findUnverifiedStrings ───────────────────────────────────────────────────────────────────────

/**
 * Pure. Collapses every run of whitespace to one space and trims.
 *
 * A label is one continuous sentence ON SCREEN, but neither side of the comparison keeps it on one
 * line: a long string wraps inside a template literal or an HTML attribute in the source, and a long
 * bold span wraps inside a paragraph in the article. Either wrap defeats a literal substring match,
 * and the failure looks exactly like a renamed button — which is the one signal this gate must not
 * counterfeit. Normalising both sides makes the comparison about the label rather than about where
 * two unrelated editors happened to break a line.
 *
 * Punctuation is deliberately NOT touched. `**Publish.**` extracting `Publish.` is a known false
 * failure, and it stays one: labels ending in a full stop genuinely exist — every validation message
 * in `contracts/answer-format.ts` is one — so trimming punctuation would weaken a real match to
 * silence a loud, visible, one-line fix.
 */
export const normaliseWhitespace = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * Pure. The spans that are neither in the product source nor allowlisted. Case-sensitive on
 * purpose: the capitals and punctuation on screen are part of the label. Spacing is the one thing
 * normalised, for the reason above.
 */
export function findUnverifiedStrings({ spans, sourceText, allowlist }) {
    const haystack = normaliseWhitespace(sourceText);
    const allowed = new Set([...allowlist].map(normaliseWhitespace));
    return spans.filter((span) => {
        const label = normaliseWhitespace(span.text);
        return !haystack.includes(label) && !allowed.has(label);
    });
}

/** Pure. Is this source path a test file rather than the product? Tolerates Windows separators. */
export function isExcludedSourcePath(filePath) {
    const normalised = filePath.split('\\').join('/');
    return EXCLUDE_PATH_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

// ── parseAllowlist ──────────────────────────────────────────────────────────────────────────────

/**
 * Pure. One entry per line; `#` starts a comment only as the first non-blank character, so a label
 * containing a hash is still expressible. A missing or comment-only file is an EMPTY allowlist, not
 * an error — the file ships with nothing but its own instructions, and needing an entry in it is
 * meant to feel like a small defeat.
 */
export function parseAllowlist(text) {
    if (text === null || text === undefined) return new Set();
    return new Set(
        text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== '' && !line.startsWith('#')),
    );
}

// ── Reading the world ───────────────────────────────────────────────────────────────────────────

function listFilesRecursively(dir, extensions) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listFilesRecursively(full, extensions));
        else if (extensions.includes(path.extname(entry.name))) out.push(full);
    }
    return out.sort();
}

/**
 * Every `.ts` and `.html` file under the product packages that is not a test, concatenated once and
 * whitespace-normalised once. Exported so its spec can assert what is in the haystack and what is
 * not — the two things that decide what this gate can see at all.
 */
export function buildHaystack() {
    const files = [];
    for (const dir of SOURCE_DIRS) {
        if (!existsSync(dir)) {
            throw new Error(
                `Product source directory not found: ${path.relative(REPO_ROOT, dir)}. Every bold ` +
                'span is checked against it, so an empty haystack would fail every article at once.',
            );
        }
        files.push(
            ...listFilesRecursively(dir, SOURCE_EXTENSIONS).filter((f) => !isExcludedSourcePath(f)),
        );
    }
    if (files.length === 0) throw new Error('No product .ts or .html files found under the source roots.');
    const haystack = normaliseWhitespace(
        files.map((file) => readFileSync(file, 'utf8')).join(FILE_SEPARATOR),
    );
    if (haystack.length === 0) throw new Error('The product source haystack is empty.');
    return { haystack, files };
}

/** Where a link target written in `fromFile` points. A leading "/" is the site root, per STYLE §8. */
function resolveTarget(fromFile, target) {
    const base = target.startsWith('/') ? HELP_DIR : path.dirname(fromFile);
    const relative = target.startsWith('/') ? target.slice(1) : target;
    return path.resolve(base, relative);
}

const rel = (file) => path.relative(REPO_ROOT, file);

// ── The four checks ─────────────────────────────────────────────────────────────────────────────

/**
 * The product's own links into the help centre.
 *
 * A MISSING `help-links.ts` is a hard failure, not a skip. This repository's gates resolve every
 * uncertainty towards running the check (`scripts/check-paths-touched.mjs` says why at length): a
 * skip here would mean that moving or renaming the file silently retires the only thing standing
 * between a renamed article and five dead links in the product, and nothing would ever say so. The
 * cost of failing loudly is one line to update in this file, on the pull request that moved it.
 */
function checkProductLinks() {
    if (!existsSync(HELP_LINKS_FILE)) {
        throw new Error(
            `${rel(HELP_LINKS_FILE)} not found. It holds the help-centre URLs the in-product empty ` +
            'states link to, and this gate is the only thing checking that those articles exist. ' +
            'If the file moved, point HELP_LINKS_FILE at its new home — do not delete this check.',
        );
    }
    const source = readFileSync(HELP_LINKS_FILE, 'utf8');
    const links = extractHelpLinkPaths(source);
    if (links.length === 0) {
        throw new Error(
            `No "#/<article>" help-centre routes found in ${rel(HELP_LINKS_FILE)}. Either the URL ` +
            'shape changed, in which case update HELP_ROUTE_FRAGMENT, or the links are gone.',
        );
    }
    const articleExists = (relativeToSiteRoot) => {
        // A route is site-absolute by construction, which is exactly what resolveTarget's leading
        // "/" branch means — so the product's links and the sidebar's resolve through one function.
        const resolved = resolveTarget(HELP_LINKS_FILE, `/${relativeToSiteRoot}`);
        return existsSync(resolved) && statSync(resolved).isFile();
    };
    return { links, broken: findBrokenHelpLinks({ links, articleExists }) };
}

function run() {
    if (!existsSync(HELP_DIR)) throw new Error(`Help centre directory not found: ${rel(HELP_DIR)}`);
    const articles = listFilesRecursively(HELP_DIR, ['.md']);
    if (articles.length === 0) throw new Error(`No markdown files under ${rel(HELP_DIR)}.`);

    const { haystack, files: sourceFiles } = buildHaystack();
    const allowlist = parseAllowlist(
        existsSync(ALLOWLIST_FILE) ? readFileSync(ALLOWLIST_FILE, 'utf8') : null,
    );

    const failures = { strings: [], links: [], unreachable: [], productLinks: [] };
    let spanCount = 0;
    let linkCount = 0;

    for (const file of articles) {
        const markdown = readFileSync(file, 'utf8');

        const spans = extractBoldSpans(markdown);
        spanCount += spans.length;
        for (const span of findUnverifiedStrings({ spans, sourceText: haystack, allowlist })) {
            failures.strings.push({ file, ...span });
        }

        for (const link of extractLinks(markdown)) {
            linkCount += 1;
            const resolved = resolveTarget(file, link.target);
            if (!existsSync(resolved) || !statSync(resolved).isFile()) {
                failures.links.push({ file, ...link });
            }
        }
    }

    // Reachability runs article -> sidebar, so a new article is unreachable until it is listed.
    const sidebarFile = path.join(HELP_DIR, SIDEBAR);
    if (!existsSync(sidebarFile)) throw new Error(`${rel(sidebarFile)} is missing.`);
    const listed = new Set(
        extractLinks(readFileSync(sidebarFile, 'utf8')).map((link) =>
            path.relative(HELP_DIR, resolveTarget(sidebarFile, link.target)),
        ),
    );
    for (const file of articles) {
        const relativeToHelp = path.relative(HELP_DIR, file);
        if (isNavigable(relativeToHelp) && !listed.has(relativeToHelp)) {
            failures.unreachable.push(relativeToHelp);
        }
    }

    const productLinks = checkProductLinks();
    failures.productLinks = productLinks.broken;

    return {
        failures,
        articles,
        spanCount,
        linkCount,
        productLinkCount: productLinks.links.length,
        sourceFileCount: sourceFiles.length,
    };
}

function report({ failures, articles, spanCount, linkCount, productLinkCount, sourceFileCount }) {
    const total =
        failures.strings.length + failures.links.length + failures.unreachable.length +
        failures.productLinks.length;
    if (total === 0) {
        console.log(
            `check-help-docs: ${articles.length} articles, ${spanCount} bold spans verified against ` +
            `${sourceFileCount} product source files, ${linkCount} links resolved, all reachable, ` +
            `${productLinkCount} help links from the product resolved.`,
        );
        return 0;
    }

    if (failures.strings.length > 0) {
        console.error('\nBold spans that are not on screen anywhere in the product source:\n');
        for (const f of failures.strings) {
            console.error(`  ${rel(f.file)}:${f.line}  ${JSON.stringify(f.text)}`);
        }
        console.error(
            '\n  Bold means "this text is on the screen" (docs/help/STYLE.md §6). First assume the\n' +
            '  label was RENAMED and fix the article. Only if the text is genuinely composed at\n' +
            '  runtime, or comes from MemberJunction rather than this repository, add it to\n' +
            '  docs/help/.ui-strings-allow.txt with a comment giving the reason.',
        );
    }

    if (failures.links.length > 0) {
        console.error('\nLinks and images whose target does not exist on disk:\n');
        for (const f of failures.links) {
            console.error(`  ${rel(f.file)}:${f.line}  ${JSON.stringify(f.target)}`);
        }
        console.error(
            '\n  Write internal links the way they sit on disk, including the ".md" (STYLE.md §8).\n' +
            '  In _sidebar.md and _navbar.md only, a path starts at the site root with "/".\n' +
            '  Link an article in the same commit that adds the article.',
        );
    }

    if (failures.unreachable.length > 0) {
        console.error('\nArticles that _sidebar.md does not link to:\n');
        for (const f of failures.unreachable) console.error(`  ${f}`);
        console.error('\n  An article nobody can navigate to is an article nobody reads.');
    }

    if (failures.productLinks.length > 0) {
        console.error('\nHelp-centre links in the product that name no article:\n');
        for (const f of failures.productLinks) {
            console.error(`  ${rel(HELP_LINKS_FILE)}:${f.line}  ${JSON.stringify(`#/${f.path}`)}`);
        }
        console.error(
            '\n  A route "#/x/y" is the article docs/help/x/y.md. These five URLs are what the\n' +
            '  in-product empty states send a stuck reader to, so a rename here is a 404 delivered\n' +
            '  at the worst possible moment. Rename the link, or restore the article.',
        );
    }

    console.error(`\ncheck-help-docs: ${total} problem(s).\n`);
    return 1;
}

// `import.meta.main` is Node 24+, and this file is also imported by its spec, so compare argv.
if (process.argv[1] && process.argv[1].endsWith('check-help-docs.mjs')) {
    process.exit(report(run()));
}
