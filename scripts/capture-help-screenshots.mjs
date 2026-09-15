#!/usr/bin/env node
/**
 * Regenerates the orientation screenshots in `docs/help/images/`.
 *
 * ── WHY A SCRIPT AND NOT A FOLDER OF PNGs ───────────────────────────────────────────────────────
 * `docs/help/STYLE.md` §9 promises the reader about fifteen *orientation* images — one per major
 * surface, answering "where am I and what am I looking at" — and promises the next contributor that
 * they can be REGENERATED rather than re-staged by hand. A screenshot nobody can reproduce is a
 * screenshot nobody will ever update: the first panel that moves leaves it wrong forever, and the
 * only way back is an afternoon of clicking. This file is the way back. Run it after a visual
 * change to a surface and commit what it writes.
 *
 * It is an on-demand tool, NOT a gate. Nothing in CI runs it: it needs a signed-in MJ host, and a
 * check that cannot run without one is a check that is permanently red or permanently skipped.
 * What CI does enforce is that every image an article references exists on disk
 * (`npm run lint:help`).
 *
 * ── THE FORM IT EXPECTS, AND WHY EVERY FIELD OF IT IS INVENTED ──────────────────────────────────
 * Every image comes from one fabricated demo form:
 *
 *     name          Volunteer signup
 *     id            0A4968D2-D37D-4D94-8B1C-FD6CF023FCF4
 *     share link    /f/share-link-euyqz
 *     questions     How can we reach you? (Contact info)
 *                   Which shift suits you best? (Multiple choice)
 *                   Anything we should know before your first shift? (Long text)
 *     responses     one, from a fabricated "Robin Example" at robin@example.invalid
 *
 * That is not a nicety. A development database holds hundreds of forms and a thousand responses
 * belonging to other people, and the Responses, Insights and respondent-profile surfaces show them
 * by default — real names, real email addresses, real free text. These images are published to a
 * public GitHub Pages site, where a leaked name is not recoverable. So: capture the demo form, and
 * nothing else. Never fabricate data into somebody else's record to get a shot; make the demo form
 * carry it instead.
 *
 * Two surfaces list every form on the database rather than one. `formsHome` and `insights`
 * therefore type the demo form's name into the surface's own search box first, so the list that
 * ends up in the picture holds one row and that row is the demo form. Filtering is a deliberate
 * part of the shot, not an accident of timing.
 *
 * One more leak has nothing to do with Forms: the account button in the MJ header renders the
 * signed-in person's profile PHOTO. `hideSignedInPhoto` replaces it with a blank disc before every
 * Explorer capture.
 *
 * `assertDemoForm` is the backstop. If the builder ever opens on a form that is not the demo one —
 * a stale id, a restored database, a copy-pasted URL — the run stops before a shutter opens rather
 * than writing somebody else's questions into `docs/`.
 *
 * ── THE DEVICE-PIXEL-RATIO TRAP ─────────────────────────────────────────────────────────────────
 * The size you ask for is not the size you get, and the difference is silent. Chromium inherits the
 * device pixel ratio of the display it is on; on the machine this was first run on, Playwright
 * reported a DPR of 0.5, so a 1440-CSS-pixel viewport produced a 720-pixel PNG — half resolution,
 * blurry on the site, and nothing anywhere said so.
 *
 * Two defences, and keep both. The context pins `deviceScaleFactor: 1` so the ratio is ours rather
 * than the display's; and `verifyWritten` reads the dimensions back out of the PNG that was
 * actually written and fails loudly if they are not the ones requested. Measure the file. Do not
 * trust the number you asked for.
 *
 * ── SIGNING IN ─────────────────────────────────────────────────────────────────────────────────
 * Explorer needs an authenticated session and this script has no credentials. Sign in by hand once:
 *
 *     node scripts/capture-help-screenshots.mjs --login    # opens a browser; sign in; it saves
 *     node scripts/capture-help-screenshots.mjs            # captures everything
 *     node scripts/capture-help-screenshots.mjs --only design   # just the images whose name matches
 *
 * `--login` writes a Playwright storage state to `.playwright-mcp/` (gitignored — it holds a live
 * token, so it must never be committed). Override the path with HELP_SHOTS_AUTH. The public
 * respondent shots need no session at all.
 *
 * Requires `playwright` and its Chromium, which are NOT dependencies of this repo — a browser
 * download does not belong in every `pnpm install` for a tool that runs twice a year:
 *
 *     npm i --no-save playwright && npx playwright install chromium
 */

import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const IMAGE_DIR = join(REPO_ROOT, 'docs', 'help', 'images');

const EXPLORER_ORIGIN = process.env.HELP_SHOTS_EXPLORER ?? 'http://localhost:4201';
const API_ORIGIN = process.env.HELP_SHOTS_API ?? 'http://localhost:4000';
const AUTH_STATE = process.env.HELP_SHOTS_AUTH ?? join(REPO_ROOT, '.playwright-mcp', 'help-shots-auth.json');

/** The one form every image is allowed to show. See the header. */
const DEMO = {
    formName: 'Volunteer signup',
    formId: '0A4968D2-D37D-4D94-8B1C-FD6CF023FCF4',
    publicPath: '/f/share-link-euyqz',
    branchQuestion: 'Which shift suits you best?',
    branchAnswer: 'Saturday morning',
    branchDestination: 'Anything we should know before your first shift?',
    /** What to type into a surface's own search box to leave the demo form alone in the list. */
    searchTerm: 'Volunteer',
};

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/** Big enough for a cold MJ boot behind its "Loading workspace…" splash. */
const READY_TIMEOUT_MS = 45_000;
/** How long `--login` waits for a person to finish signing in. */
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
/** STYLE §9 images are read on phones. Above this, downscale rather than shipping it. */
const MAX_IMAGE_BYTES = 400 * 1024;

/**
 * The account button renders the signed-in person's profile photograph. Blank it rather than crop
 * around it: the header is part of "where am I", and a cropped header is a different surface.
 */
const HIDE_PHOTO_CSS = `
  button.avatar-btn img { visibility: hidden !important; }
  button.avatar-btn { background: #33414f !important; }
`;

const builderUrl = () => `${EXPLORER_ORIGIN}/app/forms/record/MJ_BizApps_Forms:%20Forms/ID%7C${DEMO.formId}`;

// ── the shots ───────────────────────────────────────────────────────────────────────────────────

/**
 * One entry per surface an article introduces. `viewport` is the size of the PNG that lands on
 * disk; where it is shorter than a screen, that is because the surface's content is shorter and
 * the rest of the shot would be an empty field of background.
 *
 * `session: true` means the shot is inside Explorer and needs a signed-in browser. The two
 * respondent shots do not — they are the public form, which is the whole point of it — so
 * `--only respondent` runs with no saved session at all.
 */
const SHOTS = [
    { file: 'forms-home.png', viewport: { width: 1440, height: 380 }, session: true, prepare: formsHome },
    { file: 'build-tab.png', viewport: DESKTOP, session: true, prepare: buildTab },
    { file: 'question-settings.png', viewport: DESKTOP, session: true, prepare: questionSettings },
    { file: 'edit-logic.png', viewport: DESKTOP, session: true, prepare: editLogic },
    { file: 'design-tab.png', viewport: DESKTOP, session: true, prepare: designTab },
    { file: 'distribute-link.png', viewport: DESKTOP, session: true, prepare: (page) => distribute(page, 'Link') },
    { file: 'distribute-qr.png', viewport: DESKTOP, session: true, prepare: (page) => distribute(page, 'QR code') },
    { file: 'distribute-embed.png', viewport: DESKTOP, session: true, prepare: (page) => distribute(page, 'Embed') },
    { file: 'automate-tab.png', viewport: DESKTOP, session: true, prepare: automateTab },
    { file: 'responses-tab.png', viewport: { width: 1440, height: 520 }, session: true, prepare: responsesTab },
    { file: 'insights.png', viewport: DESKTOP, session: true, prepare: insights },
    { file: 'preview-dialog.png', viewport: DESKTOP, session: true, prepare: previewDialog },
    { file: 'respondent-desktop.png', viewport: { width: 1440, height: 1000 }, session: false, prepare: respondentForm },
    { file: 'respondent-phone.png', viewport: PHONE, session: false, prepare: respondentForm },
];

async function formsHome(page) {
    await page.goto(`${EXPLORER_ORIGIN}/app/forms`);
    await page.getByRole('button', { name: 'New form' }).waitFor({ timeout: READY_TIMEOUT_MS });
    await hideSignedInPhoto(page);
    // Filtered on purpose: unfiltered, this list is every form on the database. See the header.
    await page.locator('input[placeholder="Search forms"]').fill(DEMO.searchTerm);
    await page.getByText(DEMO.formName, { exact: true }).first().waitFor();
}

async function buildTab(page) {
    await openBuilder(page, 'Build');
}

async function questionSettings(page) {
    await openBuilder(page, 'Build');
    await selectBranchQuestion(page);
}

/**
 * The logic dialog is worth a picture only with a rule in it — empty, it is two headings. The rule
 * is written and never confirmed: the shot stops short of **Done**, which is the only thing that
 * would put it on the form, so this capture writes nothing to the database.
 */
async function editLogic(page) {
    await openBuilder(page, 'Build');
    await selectBranchQuestion(page);
    await page.locator('aside button[aria-label="Add a rule"]').click();
    await page.getByRole('button', { name: 'Add rule' }).click();
    await page.locator('select.cre-value').selectOption(DEMO.branchAnswer);
    await page.locator('select.le-then-select').selectOption(DEMO.branchDestination);
}

async function designTab(page) {
    await openBuilder(page, 'Design');
    await resetPreviewScroll(page);
}

async function distribute(page, view) {
    await openBuilder(page, 'Distribute');
    await page.getByRole('button', { name: view, exact: true }).click();
}

async function automateTab(page) {
    await openBuilder(page, 'Automate');
}

async function responsesTab(page) {
    await openBuilder(page, 'Responses');
    await page.getByText('across every published version').waitFor();
}

async function insights(page) {
    await page.goto(`${EXPLORER_ORIGIN}/app/forms/Responses%20&%20Analytics`);
    const search = page.locator('input[placeholder="Find a form"]');
    await search.waitFor({ timeout: READY_TIMEOUT_MS });
    // Filtered for the same reason as the Forms home: the rail lists every published form.
    await search.fill(DEMO.searchTerm);
    await page.getByRole('button', { name: DEMO.formName }).click();
    await hideSignedInPhoto(page);
    await page.getByText('Who responded').waitFor();
}

async function previewDialog(page) {
    await openBuilder(page, 'Build');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.locator('button[aria-label="Mobile preview"]').click();
    await resetPreviewScroll(page);
}

/**
 * The published form as a respondent gets it. No session, no Explorer chrome, no photo to hide.
 *
 * The scroll back to the top is not belt and braces: the widget puts the caret in its first field,
 * and at phone height that alone scrolls the form's own title off the shot.
 */
async function respondentForm(page) {
    await page.goto(`${API_ORIGIN}${DEMO.publicPath}`);
    await page.getByText(DEMO.formName).first().waitFor({ timeout: READY_TIMEOUT_MS });
    await page.evaluate(() => { window.scrollTo(0, 0); });
}

// ── surface helpers ─────────────────────────────────────────────────────────────────────────────

async function openBuilder(page, tab) {
    await page.goto(builderUrl());
    await page.locator('[role="tablist"][aria-label="Builder workspace"]').waitFor({ timeout: READY_TIMEOUT_MS });
    await assertDemoForm(page);
    await hideSignedInPhoto(page);
    if (tab !== 'Build') {
        await page.getByRole('tab', { name: tab }).click();
    }
    await page.locator('[role="tab"][aria-selected="true"]').filter({ hasText: tab }).waitFor();
}

/**
 * Refuses to photograph anybody else's form. Cheap here, and the only check between a stale form id
 * and a stranger's questions on a public website.
 */
async function assertDemoForm(page) {
    const name = await page.locator('input.fb-name').inputValue();
    if (name !== DEMO.formName) {
        throw new Error(
            `Refusing to capture: the builder opened "${name}", not the demo form "${DEMO.formName}". ` +
            `Every help image must come from the fabricated demo form (see this script's header and ` +
            `docs/help/STYLE.md §9). Check HELP_SHOTS_EXPLORER and the form id in DEMO.`,
        );
    }
}

async function selectBranchQuestion(page) {
    await page.locator(`article[aria-label="Edit question ${DEMO.branchQuestion}"]`).click();
    await page.getByText('Question settings').waitFor();
}

/** The Design tab and the Preview dialog keep their scroll position; start both at the form title. */
async function resetPreviewScroll(page) {
    const stage = page.locator('.ps-stage');
    await stage.waitFor();
    await stage.evaluate((element) => { element.scrollTop = 0; });
}

async function hideSignedInPhoto(page) {
    await page.addStyleTag({ content: HIDE_PHOTO_CSS });
}

// ── writing and checking the files ──────────────────────────────────────────────────────────────

/** Pure. Width and height out of a PNG's IHDR chunk, which is always the first 24 bytes. */
function readPngSize(buffer) {
    const isPng = buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47;
    if (!isPng) {
        throw new Error(`Not a PNG: the file starts with ${buffer.subarray(0, 8).toString('hex')}.`);
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * The postcondition that makes the device-pixel-ratio trap audible. A screenshot at the wrong
 * resolution looks perfectly fine in a file listing and perfectly wrong on the site.
 */
async function verifyWritten(path, viewport) {
    const size = readPngSize(await readFile(path));
    if (size.width !== viewport.width || size.height !== viewport.height) {
        throw new Error(
            `${path} is ${size.width}×${size.height}, not the ${viewport.width}×${viewport.height} ` +
            `that was requested. That is the device-pixel-ratio trap: the browser is rendering at a ` +
            `scale factor this script did not set. See the header.`,
        );
    }
    const { size: bytes } = await stat(path);
    if (bytes > MAX_IMAGE_BYTES) {
        console.warn(
            `  warning: ${Math.round(bytes / 1024)} KB, over the ${MAX_IMAGE_BYTES / 1024} KB budget ` +
            `in STYLE.md §9 — downscale it before committing.`,
        );
    }
    return bytes;
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Playwright is imported late on purpose: it is an optional tool-only dependency this repo does not
 * install (see the header), and a bare ERR_MODULE_NOT_FOUND tells a documentation author nothing.
 */
async function loadChromium() {
    try {
        const { chromium } = await import('playwright');
        return chromium;
    } catch (cause) {
        throw new Error(
            'playwright is not installed. It is not a dependency of this repo — install it just for ' +
            'this run:\n    npm i --no-save playwright && npx playwright install chromium',
            { cause },
        );
    }
}

async function saveSignIn(chromium) {
    const browser = await chromium.launch({ headless: false });
    try {
        const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
        const page = await context.newPage();
        await page.goto(`${EXPLORER_ORIGIN}/app/forms`);
        console.log('Sign in to MemberJunction in the browser window. Waiting…');
        await page.getByRole('button', { name: 'New form' }).waitFor({ timeout: SIGN_IN_TIMEOUT_MS });
        await context.storageState({ path: AUTH_STATE });
        console.log(`Signed in. Session saved to ${AUTH_STATE} — it holds a live token, so do not commit it.`);
    } finally {
        await browser.close();
    }
}

/** Pure. The shots to take: all of them, or the ones whose file name contains `only`. */
function selectShots(shots, only) {
    if (only === undefined) {
        return shots;
    }
    const chosen = shots.filter((shot) => shot.file.includes(only));
    if (chosen.length === 0) {
        throw new Error(`--only ${only} matches no image. Known: ${shots.map((s) => s.file).join(', ')}.`);
    }
    return chosen;
}

async function captureAll(chromium, only) {
    const shots = selectShots(SHOTS, only);
    const needsSession = shots.some((shot) => shot.session);
    const haveSession = await stat(AUTH_STATE).then(() => true, () => false);
    if (needsSession && !haveSession) {
        throw new Error(
            `No saved session at ${AUTH_STATE}, and ${shots.filter((s) => s.session).length} of the ` +
            'selected shots are inside Explorer. Create one with:\n' +
            '    node scripts/capture-help-screenshots.mjs --login',
        );
    }
    await mkdir(IMAGE_DIR, { recursive: true });

    const browser = await chromium.launch();
    try {
        // deviceScaleFactor is pinned here, not inherited from the display. See the header.
        const context = await browser.newContext({
            storageState: haveSession ? AUTH_STATE : undefined,
            deviceScaleFactor: 1,
        });
        for (const shot of shots) {
            const page = await context.newPage();
            try {
                await page.setViewportSize(shot.viewport);
                await shot.prepare(page);
                const path = join(IMAGE_DIR, shot.file);
                await page.screenshot({ path });
                const bytes = await verifyWritten(path, shot.viewport);
                console.log(`  ${shot.file}  ${shot.viewport.width}×${shot.viewport.height}  ${Math.round(bytes / 1024)} KB`);
            } finally {
                await page.close();
            }
        }
        console.log(`\n${shots.length} images written to docs/help/images/.`);
        console.log('Look at every one before committing: no image may contain a real person\'s data.');
    } finally {
        await browser.close();
    }
}

async function main() {
    const chromium = await loadChromium();
    if (process.argv.includes('--login')) {
        await saveSignIn(chromium);
        return;
    }
    const onlyAt = process.argv.indexOf('--only');
    if (onlyAt !== -1 && process.argv[onlyAt + 1] === undefined) {
        throw new Error('--only needs a file name or part of one, e.g. --only respondent.');
    }
    await captureAll(chromium, onlyAt === -1 ? undefined : process.argv[onlyAt + 1]);
}

main().catch((error) => {
    console.error(`\ncapture-help-screenshots failed: ${error.message}`);
    if (error.cause) {
        console.error(`  cause: ${error.cause.message ?? error.cause}`);
    }
    process.exitCode = 1;
});
