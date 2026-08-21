/**
 * The small slice of Markdown a chat reply actually uses, parsed into something a template can
 * render — deliberately NOT into HTML.
 *
 * ── WHY NOT `innerHTML`, AND WHY NOT A LIBRARY. ──────────────────────────────────────────────
 * The obvious implementation is `marked` into `[innerHTML]`. That puts model-authored text on a
 * path to the DOM as markup, which is an XSS surface fed by a source we do not control — a form
 * author can make the assistant say anything, including a payload, just by asking it to. Angular's
 * sanitizer would catch most of it, and "most" is the wrong word to be using about that.
 *
 * So this returns DATA and the template renders it with ordinary bindings. Every string reaches the
 * DOM as a text node, which cannot execute anything, and no dependency is added to a widget bundle
 * that is already 1.2 MB.
 *
 * It is not a Markdown implementation and does not try to be. It handles bold, inline code, bullet
 * lists and paragraphs, because that is what the prompt asks for and what the assistant produces.
 * Anything else renders as its literal text, which is a legible failure rather than a broken one.
 */

/** One run of text inside a line. */
export interface ChatSpan {
  text: string;
  /** `**bold**` */
  bold?: boolean;
  /** `` `code` `` — used for colour values and token names. */
  code?: boolean;
}

/** A rendered block. */
export type ChatBlock =
  | { kind: 'paragraph'; spans: ChatSpan[] }
  | { kind: 'list'; items: ChatSpan[][] };

/**
 * Parse a reply into blocks.
 *
 * Blank lines separate paragraphs; consecutive `-` or `*` lines become one list. Everything else is
 * paragraph text, so a heading or a table arrives as the characters the author sees rather than
 * disappearing.
 */
export function parseChatMarkdown(markdown: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', spans: parseSpans(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list.map(parseSpans) });
      list = [];
    }
  };

  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * Split one line into bold / code / plain runs.
 *
 * One pass over a combined pattern rather than nested passes, because nesting is what makes a
 * hand-rolled inline parser mangle `**a `b` c**` — and the combined form simply treats whichever
 * marker opens first as the one that owns the run.
 */
export function parseSpans(line: string): ChatSpan[] {
  const spans: ChatSpan[] = [];
  const pattern = /(\*\*(.+?)\*\*)|(`([^`]+)`)/g;
  let cursor = 0;

  for (let match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
    if (match.index > cursor) {
      spans.push({ text: line.slice(cursor, match.index) });
    }
    if (match[2] !== undefined) {
      spans.push({ text: match[2], bold: true });
    } else {
      spans.push({ text: match[4], code: true });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) {
    spans.push({ text: line.slice(cursor) });
  }
  // A line that is entirely markers, or empty, still needs one span so the template has something
  // to render rather than collapsing the paragraph to nothing.
  return spans.length > 0 ? spans : [{ text: line }];
}
