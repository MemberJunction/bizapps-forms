import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildHaystack,
    extractBoldSpans,
    extractLinks,
    findUnverifiedStrings,
    isExcludedSourcePath,
    normaliseWhitespace,
    parseAllowlist,
} from './check-help-docs.mjs';

const NUL = String.fromCharCode(0);

// ── extractBoldSpans ────────────────────────────────────────────────────────────────────────────
// This is the half of the gate that decides what gets checked at all. Everything it fails to see is
// a quoted label nobody will ever verify again, so the cases below are mostly about NOT missing one.

test('extractBoldSpans finds a double-asterisk span', () => {
    assert.deepEqual(extractBoldSpans('Click **Publish** now.'), [{ text: 'Publish', line: 1 }]);
});

test('extractBoldSpans ignores a bold marker inside a fenced code block', () => {
    assert.deepEqual(extractBoldSpans('```\n**not a label**\n```\n'), []);
});

test('extractBoldSpans ignores inline code', () => {
    assert.deepEqual(extractBoldSpans('`**literal**`'), []);
});

test('extractBoldSpans reports the correct line number', () => {
    assert.deepEqual(extractBoldSpans('a\nb\n**Save**'), [{ text: 'Save', line: 3 }]);
});

test('extractBoldSpans finds every span on one line', () => {
    assert.deepEqual(extractBoldSpans('the **Distribute** tab and **Publish**'), [
        { text: 'Distribute', line: 1 },
        { text: 'Publish', line: 1 },
    ]);
});

test('extractBoldSpans keeps line numbers correct after a stripped fence', () => {
    // The stripper must blank a fence in place, not delete it, or every line number after the
    // first code block in an article points at the wrong line and the report is useless.
    assert.deepEqual(extractBoldSpans('x\n```\n**no**\n```\n**Publish**'), [{ text: 'Publish', line: 5 }]);
});

test('extractBoldSpans handles a four-backtick fence containing three-backtick fences', () => {
    // STYLE.md §5 is exactly this shape: a ````markdown fence wrapping a ``` example.
    const md = '````markdown\n```\n**inside**\n```\n````\n**Publish**';
    assert.deepEqual(extractBoldSpans(md), [{ text: 'Publish', line: 6 }]);
});

test('extractBoldSpans does not treat a shorter run as closing a longer fence', () => {
    assert.deepEqual(extractBoldSpans('````\n```\n**inside**\n````\n'), []);
});

test('extractBoldSpans ignores a tilde fence', () => {
    assert.deepEqual(extractBoldSpans('~~~\n**not a label**\n~~~\n'), []);
});

test('extractBoldSpans ignores a multi-backtick inline code span', () => {
    assert.deepEqual(extractBoldSpans('``a ` b **nope**``'), []);
});

test('extractBoldSpans ignores an HTML comment', () => {
    // _sidebar.md parks the full planned running order in a comment. A commented-out label is not
    // on anybody's screen, so it is not a claim about the product and must not be checked.
    assert.deepEqual(extractBoldSpans('<!--\n**planned**\n-->\n**Publish**'), [{ text: 'Publish', line: 4 }]);
});

test('extractBoldSpans finds an underscore span, which renders bold just the same', () => {
    assert.deepEqual(extractBoldSpans('Click __Publish__ now.'), [{ text: 'Publish', line: 1 }]);
});

test('extractBoldSpans ignores intraword underscores, which render as literal text', () => {
    assert.deepEqual(extractBoldSpans('V202609071200__v0.3.0__Widen and __mj_BizAppsForms'), []);
});

test('extractBoldSpans does not span a blank line', () => {
    // An unmatched ** would otherwise swallow the rest of the article into one absurd span.
    assert.deepEqual(extractBoldSpans('**opened but never closed\n\nand **Publish** later'), [
        { text: 'Publish', line: 3 },
    ]);
});

test('extractBoldSpans ignores an empty or whitespace-only marker pair', () => {
    assert.deepEqual(extractBoldSpans('a ** ** b'), []);
});

test('extractBoldSpans keeps the exact text, including punctuation and case', () => {
    assert.deepEqual(extractBoldSpans('**Responses & Analytics**'), [
        { text: 'Responses & Analytics', line: 1 },
    ]);
});

// ── findUnverifiedStrings ───────────────────────────────────────────────────────────────────────

test('findUnverifiedStrings passes a span present in the source', () => {
    assert.deepEqual(findUnverifiedStrings({
        spans: [{ text: 'Publish', line: 1 }], sourceText: 'x "Publish" y', allowlist: new Set(),
    }), []);
});

test('findUnverifiedStrings flags a span absent from the source', () => {
    assert.deepEqual(findUnverifiedStrings({
        spans: [{ text: 'Pubish', line: 4 }], sourceText: 'x "Publish" y', allowlist: new Set(),
    }), [{ text: 'Pubish', line: 4 }]);
});

test('findUnverifiedStrings passes an allowlisted span absent from the source', () => {
    assert.deepEqual(findUnverifiedStrings({
        spans: [{ text: 'Page 2', line: 1 }], sourceText: '', allowlist: new Set(['Page 2']),
    }), []);
});

test('findUnverifiedStrings is case-sensitive, because the label on screen is', () => {
    assert.deepEqual(findUnverifiedStrings({
        spans: [{ text: 'publish', line: 2 }], sourceText: 'Publish', allowlist: new Set(),
    }), [{ text: 'publish', line: 2 }]);
});

test('findUnverifiedStrings flags every failure, not just the first', () => {
    assert.deepEqual(findUnverifiedStrings({
        spans: [{ text: 'a', line: 1 }, { text: 'b', line: 2 }, { text: 'c', line: 3 }],
        sourceText: 'b',
        allowlist: new Set(),
    }), [{ text: 'a', line: 1 }, { text: 'c', line: 3 }]);
});

test('findUnverifiedStrings with no spans finds nothing', () => {
    assert.deepEqual(findUnverifiedStrings({ spans: [], sourceText: '', allowlist: new Set() }), []);
});

// ── extractLinks ────────────────────────────────────────────────────────────────────────────────

test('extractLinks finds a relative markdown link', () => {
    assert.equal(extractLinks('see [x](../build/logic.md)')[0].target, '../build/logic.md');
});

test('extractLinks ignores an external link', () => {
    assert.deepEqual(extractLinks('[x](https://example.com)'), []);
});

test('extractLinks ignores http, mailto and bare fragments', () => {
    assert.deepEqual(extractLinks('[a](http://x) [b](mailto:a@b.c) [c](#heading)'), []);
});

test('extractLinks finds an image path', () => {
    assert.deepEqual(extractLinks('![the builder](images/builder.png)'), [
        { target: 'images/builder.png', line: 1 },
    ]);
});

test('extractLinks keeps a site-absolute target as written, for _sidebar.md', () => {
    assert.deepEqual(extractLinks('- [Glossary](/reference/glossary.md)'), [
        { target: '/reference/glossary.md', line: 1 },
    ]);
});

test('extractLinks drops a fragment from a target', () => {
    assert.equal(extractLinks('[x](../reference/glossary.md#score)')[0].target, '../reference/glossary.md');
});

test('extractLinks ignores a link inside a fenced code block', () => {
    // STYLE.md §5 and §8 both show link syntax in fences, pointing at files that do not exist.
    assert.deepEqual(extractLinks('````markdown\n[x](../section/article.md)\n````\n'), []);
});

test('extractLinks ignores a link inside inline code', () => {
    assert.deepEqual(extractLinks('`[x](../nope.md)`'), []);
});

test('extractLinks ignores a link inside an HTML comment', () => {
    assert.deepEqual(extractLinks('<!-- - [Later](/build/logic.md) -->'), []);
});

test('extractLinks reports the correct line number', () => {
    assert.deepEqual(extractLinks('a\n\n[x](STYLE.md)'), [{ target: 'STYLE.md', line: 3 }]);
});

test('extractLinks handles a link with a title', () => {
    assert.deepEqual(extractLinks('[x](STYLE.md "House style")'), [{ target: 'STYLE.md', line: 1 }]);
});

// ── parseAllowlist ──────────────────────────────────────────────────────────────────────────────

test('parseAllowlist treats a comment-only file as an empty allowlist', () => {
    assert.deepEqual([...parseAllowlist('# only a comment\n#\n\n   \n')], []);
});

test('parseAllowlist treats a missing file as an empty allowlist', () => {
    assert.deepEqual([...parseAllowlist(null)], []);
});

test('parseAllowlist reads one entry per line and trims it', () => {
    assert.deepEqual([...parseAllowlist('# reason\n  Page 2  \n\n# reason\nSaving…\n')], ['Page 2', 'Saving…']);
});

test('parseAllowlist keeps a hash that is not the first character', () => {
    assert.deepEqual([...parseAllowlist('Issue #4 reported')], ['Issue #4 reported']);
});

// ── Whitespace normalisation ────────────────────────────────────────────────────────────────────
// A label is one continuous sentence on screen, but neither side of the comparison keeps it on one
// line: source wraps it inside a template literal or an HTML attribute, articles wrap it inside a
// paragraph. Without this, either wrap reads as a renamed button — the one signal the gate must
// never counterfeit.

test('normaliseWhitespace collapses runs and trims', () => {
    assert.equal(normaliseWhitespace('  Save   progress\n\there  '), 'Save progress here');
});

test('normaliseWhitespace leaves the file separator intact', () => {
    // NUL is not matched by \s, which is the whole reason it separates files in the haystack: a
    // newline would collapse to a space and let the tail of one file and the head of the next read
    // as one continuous label.
    assert.equal(normaliseWhitespace(`a\n${NUL}\nb`), `a ${NUL} b`);
});

test('findUnverifiedStrings matches a label the SOURCE wrapped across two lines', () => {
    assert.deepEqual(findUnverifiedStrings({
        spans: [{ text: 'Thanks — your response has been recorded.', line: 1 }],
        sourceText: "return settings.confirmationMessage?.trim() ||\n  'Thanks — your response\n   has been recorded.';",
        allowlist: new Set(),
    }), []);
});

test('findUnverifiedStrings matches a span the ARTICLE wrapped across two lines', () => {
    assert.deepEqual(findUnverifiedStrings({
        spans: [{ text: 'Thanks — your response\nhas been recorded.', line: 7 }],
        sourceText: "const DEFAULT = 'Thanks — your response has been recorded.';",
        allowlist: new Set(),
    }), []);
});

test('a soft-wrapped bold span in an article survives extraction and verification', () => {
    const spans = extractBoldSpans('Respondents see **Thanks — your response\nhas been recorded.** at the end.');
    assert.equal(spans.length, 1);
    assert.equal(spans[0].line, 1);
    assert.deepEqual(findUnverifiedStrings({
        spans,
        sourceText: "'Thanks — your response has been recorded.'",
        allowlist: new Set(),
    }), []);
});

test('normalising does not paper over a real difference', () => {
    // Collapsing runs of whitespace is not the same as ignoring whitespace. A space that is not in
    // the label is still a different label.
    assert.deepEqual(findUnverifiedStrings({
        spans: [{ text: 'Publish Form', line: 1 }], sourceText: 'PublishForm', allowlist: new Set(),
    }), [{ text: 'Publish Form', line: 1 }]);
});

test('an allowlist entry is normalised the same way', () => {
    assert.deepEqual(findUnverifiedStrings({
        spans: [{ text: 'Page 2\nof 3', line: 1 }], sourceText: '', allowlist: new Set(['Page 2 of 3']),
    }), []);
});

test('trailing punctuation is NOT normalised away, deliberately', () => {
    // Deferred, and it stays deferred: every validation message in contracts/answer-format.ts ends
    // in a full stop, so trimming punctuation would weaken a real match to silence a loud one.
    // `**Publish.**` failing is a visible one-line fix; a silently weakened match is not.
    assert.deepEqual(findUnverifiedStrings({
        spans: [{ text: 'Publish.', line: 1 }], sourceText: 'Publish', allowlist: new Set(),
    }), [{ text: 'Publish.', line: 1 }]);
});

// ── What is in the haystack, and what is not ────────────────────────────────────────────────────
// This is the half that decides what the gate can SEE. Extension alone let 230 test files in, and a
// bold span matching only an old assertion or a mock verified clean — an article quoting a button
// no reader can find, with the gate green. That failure is silent and permanent, so it is pinned.

test('isExcludedSourcePath drops spec and test files', () => {
    assert.equal(isExcludedSourcePath('packages/Angular/src/lib/builder/form-builder.spec.ts'), true);
    assert.equal(isExcludedSourcePath('packages/Entities/src/contracts/answer-format.spec.ts'), true);
    assert.equal(isExcludedSourcePath('packages/Server/src/http/router.test.ts'), true);
});

test('isExcludedSourcePath drops a mock that is not named .spec.ts', () => {
    // The case the sibling gate's list would have missed: a helper inside __tests__ with an
    // ordinary name. packages/Angular/src has no such directory, which is why it never met it.
    assert.equal(isExcludedSourcePath('packages/Server/src/public-submit/__tests__/fakes.ts'), true);
});

test('isExcludedSourcePath KEEPS generated code, which is real shipped UI', () => {
    assert.equal(isExcludedSourcePath('packages/Angular/src/lib/generated/forms.component.ts'), false);
});

test('isExcludedSourcePath keeps ordinary product source', () => {
    assert.equal(isExcludedSourcePath('packages/Entities/src/contracts/form-screens.ts'), false);
    assert.equal(isExcludedSourcePath('packages/Angular/src/lib/widget/mj-form.component.html'), false);
});

test('isExcludedSourcePath tolerates Windows separators', () => {
    assert.equal(isExcludedSourcePath('packages\\Angular\\src\\lib\\a.spec.ts'), true);
    assert.equal(isExcludedSourcePath('packages\\Server\\src\\public-submit\\__tests__\\fakes.ts'), true);
});

test('the real haystack contains no test file', () => {
    const { files } = buildHaystack();
    const tests = files.filter(isExcludedSourcePath);
    assert.deepEqual(tests, [], `${tests.length} test files reached the haystack`);
});

test('the real haystack contains respondent-facing copy from packages/Entities/src', () => {
    // These four are the whole reason Entities is a source root: none of them exists in Angular or
    // Server, so without it the respondent FAQ could not bold a single message it quotes.
    const { haystack } = buildHaystack();
    for (const label of [
        'Thanks — your response has been recorded.',
        'Thanks for your time.',
        'Enter a valid email address.',
        'Enter a number.',
    ]) {
        assert.ok(haystack.includes(label), `the haystack cannot see ${JSON.stringify(label)}`);
    }
});

test('the real haystack still contains generated Angular code', () => {
    const { files } = buildHaystack();
    assert.ok(
        files.some((file) => file.includes('/generated/')),
        'generated code is real shipped UI and must stay in the haystack',
    );
});

test('the real haystack draws on all three source roots', () => {
    const { files } = buildHaystack();
    for (const root of ['/packages/Angular/src/', '/packages/Server/src/', '/packages/Entities/src/']) {
        assert.ok(files.some((file) => file.includes(root)), `no files from ${root}`);
    }
});
