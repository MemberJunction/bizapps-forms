import { describe, it, expect } from 'vitest';
import { parseChatMarkdown, parseSpans } from './chat-markdown';

describe('parseSpans', () => {
  it('reads bold and inline code', () => {
    expect(parseSpans('Use **#152A63** with `--mjf-accent`')).toEqual([
      { text: 'Use ' },
      { text: '#152A63', bold: true },
      { text: ' with ' },
      { text: '--mjf-accent', code: true },
    ]);
  });

  it('leaves plain text alone', () => {
    expect(parseSpans('just words')).toEqual([{ text: 'just words' }]);
  });

  it('never returns an empty span list', () => {
    // A paragraph with no spans renders as nothing, which looks like a dropped message.
    expect(parseSpans('')).toEqual([{ text: '' }]);
    expect(parseSpans('**')).toEqual([{ text: '**' }]);
  });

  it('does not mangle a line mixing both markers', () => {
    const spans = parseSpans('**Primary:** `#fff`');
    expect(spans.filter((s) => s.bold).map((s) => s.text)).toEqual(['Primary:']);
    expect(spans.filter((s) => s.code).map((s) => s.text)).toEqual(['#fff']);
  });
});

describe('parseChatMarkdown', () => {
  it('reads the shape the assistant actually writes', () => {
    const blocks = parseChatMarkdown(
      'For a background of **#152A63**:\n\n- **Primary:** #FFFFFF\n- **Muted:** #D6DDF5\n\nThat gives the strongest contrast.',
    );
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list', 'paragraph']);
    const list = blocks[1] as { kind: 'list'; items: unknown[] };
    expect(list.items).toHaveLength(2);
  });

  it('joins wrapped lines into one paragraph', () => {
    const blocks = parseChatMarkdown('one line\nand its continuation');
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { spans: Array<{ text: string }> }).spans[0].text).toBe(
      'one line and its continuation',
    );
  });

  it('accepts either bullet marker', () => {
    expect(parseChatMarkdown('* a\n* b')[0].kind).toBe('list');
    expect(parseChatMarkdown('- a\n- b')[0].kind).toBe('list');
  });

  it('renders anything it does not understand as literal text, not as nothing', () => {
    // A heading or a table should arrive as the characters the author can see. Silently dropping
    // a block is the one failure mode that looks like the assistant said less than it did.
    const blocks = parseChatMarkdown('# A heading\n\n| a | b |');
    expect(blocks).toHaveLength(2);
    expect(JSON.stringify(blocks)).toContain('# A heading');
    expect(JSON.stringify(blocks)).toContain('| a | b |');
  });

  it('produces no blocks for an empty reply', () => {
    expect(parseChatMarkdown('')).toEqual([]);
    expect(parseChatMarkdown('   \n\n  ')).toEqual([]);
  });

  it('carries markup-looking text through as text, never as markup', () => {
    // The whole reason this returns data instead of HTML: model-authored text reaches the DOM as
    // a text node, so a payload in a reply is characters on screen and nothing else.
    const blocks = parseChatMarkdown('<img src=x onerror=alert(1)>');
    expect(JSON.stringify(blocks)).toContain('<img src=x onerror=alert(1)>');
  });
});
