/**
 * Structural guards for how a form's logic is made visible on the canvas.
 *
 * There was a Rules tab: a hub listing every rule on the form in reading order, with the broken
 * ones badged. It read well and it was in the wrong place — it said things about a question that
 * belonged BESIDE that question, and an author had to know the tab existed to find out a question
 * was conditional at all. The sentences it composed are still composed (`rules-inventory.ts`);
 * what changed is where they are shown.
 *
 * The one thing that MUST survive the tab is its warning. A condition whose question is not in
 * the answer map reads `undefined` — `false` under the equality family, TRUE under
 * `isNotAnswered` / `notEquals` — so the item it guards is shown to everyone or to nobody,
 * silently, with the form still looking correct in the builder. Nothing else in the builder says
 * so, which is why the tab was worth opening and why the badge is worth rendering.
 *
 * The component uses decorated inputs and cannot be instantiated in this suite's node
 * environment, so what is checkable is the source. Comments are stripped before every assertion:
 * the source explains these decisions in prose, and a guard that matches its own documentation
 * proves nothing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const builder = (): string => stripped('form-builder.component.ts');
const builderHtml = (): string => stripped('form-builder.component.html');
/** Where the rule sentences — and the one source-list definition — actually live. */
const inventory = (): string => stripped('rules-inventory.ts');

/** Just the shared reorder path, so a guard about it cannot be satisfied by another method. */
const reorderMethod = (): string => {
  const source = builder();
  const start = source.indexOf('private async reorderQuestion(');
  const end = source.indexOf('protected reorderNotice', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

/**
 * The body of the `if (!(await this.state.persistQuestionOrder(page)))` branch, brace-matched.
 *
 * A text-position comparison cannot tell "inside the branch" from "after the branch", and the two
 * mean opposite things here: one reverts a refused drag, the other reverts every drag. Counting
 * braces is crude, but it is the difference between a guard and a decoration.
 */
const refusalBranchOf = (method: string): string => {
  const guard = method.indexOf('if (!(await this.state.persistQuestionOrder(page)))');
  expect(guard).toBeGreaterThan(-1);
  const open = method.indexOf('{', guard);
  expect(open).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = open; i < method.length; i++) {
    if (method[i] === '{') depth++;
    else if (method[i] === '}' && --depth === 0) return method.slice(open + 1, i);
  }
  throw new Error('reorderQuestion: the refusal branch never closes — did the method change shape?');
};

describe('the Rules tab is gone, not hidden', () => {
  it('leaves no tab to open', () => {
    // A tab left in the union but unreachable in the template is a state the component can still
    // be put into — by a restored preference, by a deep link, by the next person reading the
    // union and wiring a button to it.
    expect(builder()).not.toMatch(/'rules'/);
    expect(builderHtml()).not.toMatch(/mjf-rules-tab|activeTab === 'rules'/);
  });

  it('takes its component with it rather than orphaning the file', () => {
    expect(existsSync(join(__dirname, 'rules-tab.component.ts'))).toBe(false);
    expect(builder()).not.toMatch(/RulesTabComponent/);
  });
});

describe('a rule is visible on the item it is about', () => {
  it('badges the question and the page, which are the two the canvas draws', () => {
    // An ending already says "Conditional ending" in words of its own; a page said nothing at
    // all, and a page rule hides every question on it.
    const html = builderHtml();
    expect(html).toMatch(/badges\.get\(node\.entity\.ID\)/);
    expect(html).toMatch(/badges\.get\(page\.entity\.ID\)/);
  });

  it('reads the whole form once per render, not once per question', () => {
    // `ruleBadges` walks every rule on the form. Called from inside the question loop it would
    // do that once per question, on exactly the forms long enough for it to hurt.
    const html = builderHtml();
    expect(html).toMatch(/@let badges = ruleBadges;/);
    expect(html).not.toMatch(/@for \(badge of ruleBadges/);
  });

  it('says what is wrong in words, never in colour alone', () => {
    // The warning token turns a badge amber. Amber is not a message, and it is not one at all to
    // a colourblind author or a screen reader.
    const badge = stripped('rule-badge.component.ts');
    expect(badge).toMatch(/\[class\.mjf-badge--warning\]="badge\.broken"/);
    expect(badge).toMatch(/\{\{ badge\.label \}\}/);
  });

  it('shows that message on hover, rather than promising one a native tooltip withholds', () => {
    // `[title]` is technically a tooltip and practically a dead icon: the browser waits about a
    // second, so the honest reading of a hover that does nothing is that the badge is broken —
    // which is exactly the wrong impression for the badge that reports a broken rule.
    // `setting-row.component.ts` reached this conclusion first and its CSS says so; this is the
    // one place that kept the mechanism that was rejected there.
    const badge = stripped('rule-badge.component.ts');
    expect(badge).toMatch(/role="tooltip"/);
    expect(badge).toMatch(/\{\{ badge\.detail \}\}/);
    expect(badge).not.toMatch(/\[title\]="badge\.detail"/);
    // The bubble overlaps whatever sits below it. Without this it swallows that row's clicks.
    expect(badge).toMatch(/pointer-events:\s*none/);
    // Amber plus a hover bubble is still nothing to a screen reader.
    expect(badge).toMatch(/\[attr\.aria-label\]="badge\.label \+ ': ' \+ badge\.detail"/);
  });

  it('shows it to a keyboard and a touch screen too, not to a mouse alone', () => {
    // `:hover` is the one input a phone does not have, and this app is mobile-first. Without a
    // tab stop the detail was unreachable by keyboard as well: the aria-label carries it to a
    // screen reader, and a sighted author who does not use a mouse had nowhere to read it.
    const badge = stripped('rule-badge.component.ts');
    expect(badge).toMatch(/tabindex="0"/);
    expect(badge).toMatch(/:host\(:focus-within\) \.rb-tip/);
    // A focusable thing that shows nothing on focus is worse than one that cannot be focused.
    expect(badge).toMatch(/:host\(:focus-visible\)/);
  });

  it('is rendered from ONE component, not copied to each place a badge appears', () => {
    // Three sites carried the same span — a question, a section header and an ending screen — so
    // the tooltip would have been written three times and drifted twice.
    const html = builderHtml();
    expect(html.match(/<mjf-rule-badge/g) ?? []).toHaveLength(3);
    expect(html).not.toMatch(/<span[^>]*fb-rule-badge/);
  });

  it('is a label, not a second way to write a rule', () => {
    // Two write paths for one thing is how a summary and a panel come to disagree about what a
    // rule says. The badge has no click handler; selecting the row opens the panel that owns it.
    expect(stripped('rule-badge.component.ts')).not.toMatch(/\(click\)/);
  });
});

describe('what the builder offers a rule to read', () => {
  it('builds every source list through one helper, so the same questions are excluded everywhere', () => {
    // There were six places assembling a source list — a page's show gate, its jump, a
    // question's show gate, its jump, an ending's, and the Rules tab's — each mapping the tree
    // itself. Six copies of "which questions can a rule read" is six places for the answer to
    // drift, and the first thing that had to be excluded (a Statement, which collects no
    // answer) would have needed adding to all six.
    //
    // The helper moved OUT of the component with issue #79: publish has to read the same list
    // the badges resolve against, and a private method on a component is not somewhere a service
    // can reach. The invariant did not move — it got wider — so it is now asserted where the one
    // definition lives, plus the fact that the component no longer keeps a copy.
    expect(inventory()).toMatch(/export function conditionSourcesOf\(/);
    expect(inventory().match(/toConditionalSource\(/g) ?? []).toHaveLength(1);
    expect(builder()).not.toMatch(/toConditionalSource\(/);
    expect(builder()).toMatch(/conditionSourcesOf\(/);
  });

  it('drops a question that cannot be a source rather than rendering a ghost', () => {
    // `toConditionalSource` returns undefined for a question that collects no answer. Mapping
    // it straight into the array would put `undefined` in a list every consumer then indexes.
    expect(inventory()).toMatch(
      /conditionSourcesOf\([\s\S]{0,220}?toConditionalSource\([\s\S]{0,80}?\?\?\s*\[\]/,
    );
  });
});

describe('a reorder that breaks a rule says so at the drag', () => {
  it('diffs the rules around the move rather than checking them itself', () => {
    // A drag-time rule checker is a second implementation of "is this rule broken", free to
    // disagree with the badge — and then the author is told two things about one rule. The
    // difference over `collectRuleEntries` cannot disagree with the badge because it IS the
    // badge, and every breakage class added there later is warned about here for free.
    const source = builder();
    expect(source).toMatch(/const before = this\.ruleEntries;[\s\S]{0,120}moveItemInArray\(/);
    expect(source).toMatch(/newlyBrokenRules\(before, this\.ruleEntries\)/);
  });

  it('remembers WHICH question moved, not which index it left', () => {
    // An index pair is only correct while nothing else has shifted the page. Resolving by id at
    // click time makes moving the wrong question unrepresentable rather than merely unlikely.
    const source = builder();
    expect(source).toMatch(/questionId: moved\.entity\.ID/);
    expect(source).toMatch(/undoReorderMove\(notice, page\.questions\.map\(/);
  });

  it('holds the busy flag across the write it awaits', () => {
    // The method GUARDS on `busy` and nothing here ever set it, so the guard read a flag that
    // was false for the whole write and the Undo button's `[disabled]="busy"` was decoration.
    // Two reorders could then interleave over one `DisplayOrder` column — the lost update
    // `builder-state.service.ts` documents. try/finally because a stuck flag freezes every
    // guarded handler on the screen with nothing on screen to explain it.
    const method = reorderMethod();
    expect(method).toMatch(/this\.busy = true;/);
    expect(method).toMatch(/finally \{\s*this\.busy = false;/);
    expect(method.indexOf('this.busy = true')).toBeLessThan(method.indexOf('persistQuestionOrder'));
  });

  it('checks that the new order was actually written', () => {
    // `persistQuestionOrder` commits as one transaction and returns false when the database
    // refused it (issue #103). The stored order is then untouched — but this handler has already
    // moved `page.questions`, so the return value is the only thing that knows they disagree.
    expect(builder()).toMatch(/if \(!\(await this\.state\.persistQuestionOrder\(page\)\)\)/);
  });

  it('puts the canvas back when the reorder is refused', () => {
    // WAS: the array stayed moved and the notice stayed standing, so the author was looking at an
    // arrangement the database had rejected — with a band about consequences of a move that never
    // happened. The transaction rolls the database and the entities back; nothing rolled back the
    // two pieces of state the author can actually SEE.
    // The revert must be INSIDE the refusal branch — reverting unconditionally would undo every
    // successful drag on the page. `indexOf(revert) > indexOf(guard)` does NOT establish that: it
    // is satisfied by a revert moved out of the `if` and below it, which is precisely the broken
    // variant. So take the branch's own body by matching its braces, and assert against that.
    const body = refusalBranchOf(reorderMethod());
    expect(body).toMatch(/moveItemInArray\(page\.questions, to, from\)/);
    expect(body).toMatch(/this\.reorderNotice = previousNotice/);
  });

  it('is its own band, not the failure band, and carries an Undo that outlives the tick', () => {
    // `lastFailure` means one thing: the database refused a write. Widening it to "and also,
    // consequences of things that succeeded" makes a clear signal vague, and the two co-occur.
    const html = builderHtml();
    expect(html).toMatch(/class="fb-reorder-notice" role="alert"/);
    expect(html).toMatch(/\(click\)="undoReorder\(\)"/);
    expect(html).toMatch(/\(click\)="dismissReorderNotice\(\)"/);
    // Undo LEFT of dismiss — the repo's confirm-left convention, and the one action here that is
    // not "make this go away".
    expect(html.indexOf('undoReorder()')).toBeLessThan(html.indexOf('dismissReorderNotice()'));
    // Warning-toned, a step down from the error band above it: nothing is broken about the
    // form's data, a rule on it stopped being readable.
    expect(stripped('form-builder.styles.ts')).toMatch(
      /\.fb-reorder-notice \{[\s\S]{0,400}?--mj-status-warning-bg/,
    );
  });

  it('does not hide itself on a timer', () => {
    // An auto-hiding warning about something otherwise silent is the failure this issue is
    // about. The notice stands until it is undone, dismissed, or superseded by another move.
    expect(builder()).not.toMatch(/setTimeout[\s\S]{0,120}reorderNotice/);
    expect(builder()).not.toMatch(/reorderNotice[\s\S]{0,120}setTimeout/);
  });

  it('is not a toast, because the toast cannot carry the Undo', () => {
    // `MJNotificationService.CreateSimpleNotification` takes (message, style, hideAfter) and
    // renders a close button and nothing else — no action slot — and would add a peer this
    // package does not carry. Adopting an MJ package to get a control that cannot do the job is
    // the wrong reading of "use the built-in where one exists".
    expect(builder()).not.toMatch(/MJNotificationService/);
  });
});

describe('only a reorder can invert a pair, so only a reorder is watched', () => {
  it('keeps every other write path append-only', () => {
    // Plan §1.5 is the proof that the drag diff needs to hook exactly one method. If a
    // duplicate-below, an insert-at-index or a move-to-another-section ever ships, that proof
    // lapses — and this is where it says so, rather than the notice quietly under-reporting.
    const source = builder();
    const html = builderHtml();
    expect(source).not.toMatch(/transferArrayItem/);
    expect(html).not.toMatch(/cdkDropListConnectedTo/);
    // No page-order write: sections cannot be reordered, so no page's questions can change
    // their position relative to another page's.
    expect(source).not.toMatch(/persistPageOrder/);
  });
});

/**
 * A publish refusal must not outlive the rules it names.
 *
 * THE DEFECT, found smoke-testing the gate. Publish is refused, the toolbar reads *Publish
 * refused — 4 broken rules would ship with this form*, the author fixes all four, the badges go
 * green — and that line is still on screen, now beside the "Published" pill. Two answers on one
 * toolbar, one of them false, which is precisely the failure the gate exists to remove: the
 * message that enforces "the badge and the gate agree" must not itself start disagreeing with
 * the badges.
 *
 * Retired on TRUTH, not on identity, and from the same clock as the reorder band — `markDirty`
 * fires wherever an edit lands, and a spurious call can only re-confirm a still-broken form; it
 * can never retract a refusal that still applies. Asked of `brokenRuleLines`, the function the
 * refusal came from, so the message and its retraction cannot answer differently.
 */
describe('a publish refusal is retracted when its rules are fixed', () => {
  /** The component's retirement method, comments stripped — what actually runs. */
  const retireStaleRefusal = (): string => {
    const source = builder();
    const start = source.indexOf('private retireStaleRefusal(');
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('\n  }', start));
  };

  it('retires the refusal from the same clock that retires the reorder band', () => {
    // `markDirty()` is the one seam every edit already passes through — the same reason
    // `retireStaleNotice` is called there. Hanging this off any single edit path instead would
    // retract the refusal for the ways of fixing a rule that path knows about, and strand it for
    // every other way the author might have fixed it.
    const source = builder();
    const markDirty = source.slice(
      source.indexOf('private markDirty()'),
      source.indexOf('\n  }', source.indexOf('private markDirty()')),
    );
    expect(markDirty).toMatch(/this\.retireStaleRefusal\(\)/);
    expect(markDirty).toMatch(/this\.retireStaleNotice\(\)/);
  });

  it('asks brokenRuleLines, not a second opinion assembled here', () => {
    // The whole point of issue #79 is that "is this rule broken" has ONE answer. A retraction
    // computed from its own walk of the tree is a third reader that can disagree with both the
    // badge and the gate, and the disagreement would be silent.
    expect(retireStaleRefusal()).toMatch(/brokenRuleLines\(/);
  });

  it('clears only a refusal that was about rules', () => {
    // "Could not read the form's settings" is not something fixing a rule repairs, so it must
    // survive the next edit. The guard is the stored `brokenRules` from the result, which the
    // service sets on that refusal and no other.
    const method = retireStaleRefusal();
    expect(method).toMatch(/refusedRules/);
    expect(method).toMatch(/statusMessage = ''/);
  });
});
