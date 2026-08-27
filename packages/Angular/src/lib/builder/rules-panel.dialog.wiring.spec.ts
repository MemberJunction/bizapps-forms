/**
 * Structural guards for WHERE a rule is authored.
 *
 * The rules panel lives in the builder's properties rail, which is ~300px wide. A condition is a
 * question picker, an operator picker and a value, plus an any/all toggle and a jump target — the
 * same mismatch the image picker dialog was built for, whose own header says a drop target that
 * size "is a slot, not a target". Authoring therefore happens in a centered modal and the rail
 * holds only the summaries.
 *
 * These components use decorated inputs and cannot be instantiated in this suite's node
 * environment, so what is checkable is the source. Comments are stripped before every assertion:
 * the source explains these decisions in prose, and a guard that matches its own documentation
 * proves nothing — every regex below would pass against the comment that describes it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const panel = (): string => stripped('rules-panel.component.ts');
const panelHtml = (): string => stripped('rules-panel.component.html');
const dialog = (): string => stripped('rule-editor-dialog.component.ts');
const logicEditor = (): string => stripped('logic-editor.component.ts');

describe('the rule editor is a modal, not a rail expansion', () => {
  it('the dialog covers the viewport and centers its card, like the image picker', () => {
    const css = dialog();
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/inset:\s*0/);
    expect(css).toMatch(/align-items:\s*center/);
    expect(css).toMatch(/justify-content:\s*center/);
  });

  it('it takes three quarters of the viewport, leaving a quarter of backdrop', () => {
    // It used to be a 720px card, which on a large display is a third of the width and reads
    // as a tooltip rather than a workspace — while the rule list inside it scrolled.
    const css = dialog();
    expect(css).toMatch(/width:\s*min\(92vw,\s*max\(75vw,\s*\d+px\)\)/);
    expect(css).toMatch(/max-height:\s*min\(92vh,\s*max\(75vh,\s*\d+px\)\)/);
  });

  it('a small laptop gets a floor instead of a proportion, so the card is never cramped', () => {
    // 75% of a 900px-wide window is 675px, narrower than the card this replaced. The floor is
    // what keeps a small screen from being punished by a rule written for a large one.
    const floor = /width:\s*min\(92vw,\s*max\(75vw,\s*(\d+)px\)\)/.exec(dialog());
    expect(Number(floor?.[1])).toBeGreaterThanOrEqual(720);
    // …and 92vw caps it, so the floor can never push the card wider than the window itself.
    expect(dialog()).toMatch(/width:\s*min\(92vw,/);
  });

  it('a phone gets the whole screen, where a quarter of backdrop is a quarter wasted', () => {
    const phone = /@media \(max-width: 640px\) \{([\s\S]*?)\n\}/.exec(dialog())?.[1] ?? '';
    expect(phone).toMatch(/width:\s*100%/);
    expect(phone).toMatch(/height:\s*100%/);
    expect(phone).toMatch(/max-height:\s*100vh/);
  });

  it('it is dismissible three ways, so nothing can trap an author mid-rule', () => {
    expect(dialog()).toMatch(/backdrop[\s\S]{0,200}\(click\)="closeRequested\.emit\(\)"/);
    expect(dialog()).toMatch(/aria-label="Close"/);
    expect(dialog()).toMatch(/@HostListener\('document:keydown\.escape'\)/);
  });

  it('every dismissal ASKS rather than closes — the panel decides whether to warn', () => {
    // A dialog that emitted `closed` could not be talked out of closing, so the unsaved-changes
    // warning would have nothing to interrupt.
    expect(dialog()).not.toMatch(/closed\.emit/);
    expect(dialog()).toMatch(/@Output\(\) readonly closeRequested/);
  });

  it('it is announced as a modal dialog', () => {
    expect(dialog()).toMatch(/role="dialog"/);
    expect(dialog()).toMatch(/aria-modal="true"/);
  });

  it('it projects its body rather than knowing about rules', () => {
    expect(dialog()).toMatch(/<ng-content\s*\/?>/);
    expect(dialog()).not.toMatch(/jump|disqualify|ConditionalGroup/);
  });

  it('an incomplete rule row is dropped on save rather than stored half-written', () => {
    // Save is always offered — clearing every rule is a legitimate save. What must not happen
    // is a half-authored row reaching the item: a jump with no target goes nowhere, and a jump
    // with no CONDITIONS fires for everyone, which is the worst thing an unfinished edit can
    // silently become. `ruleFromLogicDraft` is where both are dropped.
    expect(panel()).toMatch(/commit\(\): void \{\s*this\.ruleChange\.emit\(ruleFromLogicDraft\(this\.draft\)\)/);
  });

  it('the logic editor is reached only through the dialog', () => {
    const html = panelHtml();
    expect(html).toMatch(/<mjf-rule-editor-dialog/);
    const dialogStart = html.indexOf('<mjf-rule-editor-dialog');
    expect(html.indexOf('<mjf-logic-editor')).toBeGreaterThan(dialogStart);
  });

  it('a card no longer expands in place', () => {
    expect(panelHtml()).not.toMatch(/isExpanded/);
    expect(panelHtml()).not.toMatch(/rp-chevron/);
    expect(panel()).not.toMatch(/toggleExpanded/);
  });

  it('there is ONE dialog and no verb picker left to get out of step with it', () => {
    // The picker existed because logic was authored a verb at a time. One dialog holds every
    // verb now, so the pick/edit union, the per-verb draft and the card specs are all gone.
    expect(panel()).not.toMatch(/pickerOpen|type RuleDialog|RuleCardSpec|availableCards/);
    expect(panel()).toMatch(/protected dialogOpen = false;/);
  });

  it('every way in goes through the one open, which is what snapshots the baseline', () => {
    // Both the header button and a summary row call `openDialog`, and `openDialog` is the only
    // place the item is read. A second entry point that forgot the baseline would break the
    // discard warning silently — it would simply never warn.
    const html = panelHtml();
    expect(html).toMatch(/class="rp-add"[\s\S]{0,200}\(click\)="openDialog\(\)"/);
    expect(html).toMatch(/class="rp-row"[\s\S]{0,120}\(click\)="openDialog\(\)"/);
    expect(panel()).toMatch(/openDialog\(\): void \{[\s\S]{0,400}this\.baseline = logicDraftOf\(this\.rule\)/);
  });

  it('changing the selected item closes the dialog', () => {
    // Otherwise a draft authored for one question would land on the next one selected.
    expect(panel()).toMatch(/set subjectId\([\s\S]{0,400}this\.closeDialog\(\)/);
  });
});

describe('the panel header is the only add affordance', () => {
  it('it is labelled RULES', () => {
    expect(panelHtml()).toMatch(/RULES/);
  });

  it('the header button has an accessible name for whichever face it is showing', () => {
    const html = panelHtml();
    expect(html).toMatch(/class="rp-add"/);
    expect(html).toMatch(/\[attr\.aria-label\]="hasRules \? 'Edit logic' : 'Add a rule'"/);
  });

  it('the inline picker list is gone from the rail', () => {
    expect(panelHtml()).not.toMatch(/rp-picker|rp-cancel/);
  });

  it('the rail says what the item does, one line per rule', () => {
    expect(panelHtml()).toMatch(/@for \(row of summaryRows; track \$index\)/);
    expect(panelHtml()).toMatch(/rp-empty/);
  });
});

describe('the section title is not written in four places', () => {
  const hosts = [
    'question-editor.component.html',
    'page-editor.component.ts',
    'screen-editor.component.ts',
  ];

  it('each host renders the panel and lets it title itself', () => {
    for (const host of hosts) {
      const src = stripped(host);
      expect(src, host).toMatch(/<mjf-rules-panel/);
      expect(src, host).not.toMatch(/Rules<\/p>|>Rules</);
    }
  });
});

describe('nothing is written until Done', () => {
  it('editing the draft does not touch the item', () => {
    // THE DEFECT this replaces: the editor emitted `ruleChange` on every keystroke, so opening
    // a card and closing it left an empty rule behind — one reading "No conditions yet" that the
    // author never asked for and had to hunt down to remove. Every edit now lands on the draft.
    expect(panel()).toMatch(/onDraftChange\(draft: LogicDraft\): void \{\s*this\.draft = draft;/);
    const body = /onDraftChange\(([\s\S]*?)\n  \}/.exec(panel())?.[1] ?? '';
    expect(body).not.toMatch(/emit/);
  });

  it('the logic editor writes to its own output and nowhere else', () => {
    // It is presentational: it holds no state and cannot reach the item. Every path out of it
    // is `draftChange`, which the panel catches into the draft.
    const editor = stripped('logic-editor.component.ts');
    expect(editor).not.toMatch(/ruleChange|BuilderStateService|\.Save\(/);
    expect(editor).toMatch(/@Output\(\) readonly draftChange/);
  });

  it('commit is where an authored rule is written', () => {
    expect(panel()).toMatch(/commit\(\)[\s\S]{0,900}this\.ruleChange\.emit/);
  });

  it('opening the dialog writes nothing', () => {
    // The one place the item is READ, and it must not also be a place the item is written.
    const body = /openDialog\(\): void \{([\s\S]*?)\n  \}/.exec(panel())?.[1] ?? '';
    expect(body).not.toMatch(/emit/);
  });

  it('commit is now the ONLY writer, because removal happens inside the dialog', () => {
    // It used to not be: a card's ✕ persisted straight from the rail, and a removal IS a write.
    // Deleting a rule is an edit to the draft now, so Save is the single write path.
    const emits = panel().match(/this\.ruleChange\.emit/g) ?? [];
    expect(emits).toHaveLength(1);
    expect(panel()).toMatch(/commit\(\)[\s\S]{0,300}this\.ruleChange\.emit/);
  });

  it('the panel writes nothing but the rule — the screen flag is not its business', () => {
    // The disqualify card used to flip `IsDisqualification` through a second output, and
    // flipping it when the card was merely OPENED left a screen that screened people out with
    // no condition to arm it. Screening out is a toggle in the screen's own settings now, so
    // this panel has exactly one output and cannot reach the flag at all.
    expect(panel()).not.toMatch(/disqualifyChange|isDisqualification/);
    expect(panel()).toMatch(/@Output\(\) ruleChange/);
  });

  it('the drafts marker set is gone, along with the reason it existed', () => {
    expect(panel()).not.toMatch(/drafts/);
  });

  it('the rail summarises the ITEM, never the draft', () => {
    // Summarising the draft would make the rail change under an author who then cancelled.
    expect(panel()).toMatch(/get summaryRows\(\)[\s\S]{0,600}this\.rule\?\.show/);
    const body = /get summaryRows\(\)[\s\S]*?\n  \}/.exec(panel())?.[0] ?? '';
    expect(body).not.toMatch(/this\.draft/);
  });
});

describe('closing asks only when there is something to lose', () => {
  it('a dismissal with no edits closes and adds nothing', () => {
    expect(panel()).toMatch(/requestClose\(\)[\s\S]{0,500}isLogicDraftDirty/);
    // The clean path closes; closeDialog is the one place that tears the dialog down, so the
    // draft cannot outlive it and leak onto the next item.
    const body = /requestClose\(\): void \{([\s\S]*?)\n  \}/.exec(panel())?.[1] ?? '';
    expect(body).toMatch(/this\.closeDialog\(\)/);
    expect(panel()).toMatch(/closeDialog\(\): void \{[\s\S]{0,400}this\.dialogOpen = false;/);
  });

  it('a dismissal with edits raises the warning instead of closing', () => {
    expect(panel()).toMatch(/requestClose\(\)[\s\S]{0,500}this\.confirmingDiscard\s*=\s*true/);
  });

  it('the warning offers both a way out and a way back', () => {
    expect(dialog()).toMatch(/\(click\)="discarded\.emit\(\)"/);
    expect(dialog()).toMatch(/\(click\)="resumed\.emit\(\)"/);
    expect(panelHtml()).toMatch(/\(discarded\)="discardDraft\(\)"/);
    expect(panelHtml()).toMatch(/\(resumed\)="resumeEditing\(\)"/);
  });

  it('discarding writes nothing', () => {
    const body = /discardDraft\(\): void \{([\s\S]*?)\n  \}/.exec(panel())?.[1] ?? '';
    expect(body).not.toMatch(/emit/);
    expect(body).toMatch(/this\.closeDialog\(\)/);
  });

  it('the draft is cleared on the way out, not left for the next item', () => {
    expect(panel()).toMatch(/closeDialog\(\): void \{[\s\S]{0,400}this\.draft = emptyLogicDraft\(\)/);
    expect(panel()).toMatch(/closeDialog\(\): void \{[\s\S]{0,400}this\.baseline = emptyLogicDraft\(\)/);
  });

  it('an empty draft has ONE spelling, so a field added to it cannot be missed', () => {
    // Four hand-written copies of `{ show: undefined, jumps: [] }` used to live here while
    // `emptyLogicDraft()` sat unused. That is fine until the draft grows a field: the compiler
    // catches the copies, but only after they have all been written wrong once. The constructor
    // is the single place that decides what "nothing authored yet" means.
    expect(panel()).not.toMatch(/show: undefined, jumps: \[\]/);
  });

  it('the warning names the consequence rather than asking "are you sure"', () => {
    expect(dialog()).toMatch(/Discard/);
    expect(dialog()).toMatch(/Keep editing/);
  });

  it('confirm sits LEFT of cancel, per the repo dialog convention', () => {
    const css = dialog();
    const discard = css.indexOf('discarded.emit()');
    const keep = css.indexOf('resumed.emit()');
    expect(discard).toBeGreaterThan(-1);
    expect(discard).toBeLessThan(keep);
  });

  it('dirtiness is value equality, so an edit put back closes silently', () => {
    // Touched-ness would warn about a dialog an author opened, changed their mind in, and put
    // back exactly as it was — which trains people to click through the warning.
    const draft = stripped('logic-draft.ts');
    expect(draft).toMatch(/isLogicDraftDirty[\s\S]{0,300}ruleFromLogicDraft\(draft\)[\s\S]{0,120}ruleFromLogicDraft\(baseline\)/);
    expect(draft).not.toMatch(/JSON\.stringify/);
  });
});

describe('a new rule starts where the author is already standing', () => {

  it('the panel hands the dialog the item being edited', () => {
    // The panel already knows it — `subjectId` is what closes the dialog when the selection
    // changes. It was simply never passed on to the thing that authors the conditions.
    expect(panelHtml()).toMatch(/\[subjectSourceId\]="subjectSourceId"/);
  });

  it('adding a rule opens it on a condition rather than an empty shell', () => {
    // "+ Add rule" used to produce a row with no condition at all: the author saw a destination
    // picker and an "Add condition" button, and had to answer "which question?" from scratch.
    expect(logicEditor()).toMatch(/addJumpRule\(this\.draft, this\.seedGroup\(/);
  });

  it('switching the show gate off Always does the same', () => {
    expect(logicEditor()).toMatch(/setAlwaysShown[\s\S]*?this\.seedGroup\(this\.sources\)/);
  });

  it('a jump seeds from the sources a jump may read, which include the item itself', () => {
    // Seeding a jump from `sources` would point it at the question BEFORE this one — the show
    // gate's list — which is the one question a jump rule is least likely to mean.
    expect(logicEditor()).toMatch(/seedGroup\(this\.jumpSources\)/);
  });

  it('with nothing to read, the seed is an empty group and not a broken condition', () => {
    expect(logicEditor()).toMatch(/seedGroup\([\s\S]*?\{\}/);
  });
});

describe('the destination select shows the destination the rule holds', () => {
  // Same creation-order defect as the condition selects (see
  // conditional-rule-editor.wiring.spec.ts): the select's `value` is written before its
  // optgroups exist, so a saved rule rendered pointing at the first destination on the list.
  // Here that is worse than cosmetic — the author reads it as where the respondent goes.

  it('each offered destination says whether it is the selected one', () => {
    expect(logicEditor()).toMatch(/\[selected\]="option\.value === valueFor\(rule\)"/);
  });

  it('the placeholder claims the selection while the rule has no destination', () => {
    expect(logicEditor()).toMatch(/<option value="" disabled \[selected\]="!rule\.target"/);
  });

  it('a stored destination the picker no longer offers still renders as the chosen one', () => {
    expect(logicEditor()).toMatch(/\[selected\]="true"/);
  });
});


describe('the header button offers the move the item actually needs', () => {
  it('an item with rules offers Edit; an item with none offers a plus', () => {
    // A pencil on an item that has nothing to edit asks the author to open a dialog to find out
    // there is nothing in it. The empty state below already says "No rules yet" — the button
    // beside it should be the way to write the first one.
    const html = panelHtml();
    expect(html).toMatch(/@if \(hasRules\)/);
    expect(html).toMatch(/fa-pen/);
    expect(html).toMatch(/fa-plus/);
  });

  it('the button and the empty-state message cannot disagree', () => {
    // Two independent reads of "does this item have rules?" is two chances to contradict each
    // other on screen — a plus above a list of rules, or "No rules yet" beside a pencil.
    const html = panelHtml();
    expect(html).toMatch(/@if \(!hasRules\) \{[\s\S]{0,160}No rules yet/);
    expect(html).not.toMatch(/summaryRows\.length === 0/);
  });

  it('having rules means the rail is showing some, not that the blob is non-empty', () => {
    // `rule` can be a phantom — `{}`, or a `show` group with no conditions left in it. What
    // decides the button is what the author can actually see listed underneath it.
    expect(panel()).toMatch(/get hasRules\(\): boolean \{[\s\S]{0,140}this\.summaryRows\.length > 0/);
  });
});

/**
 * The dialog says what a destination COSTS, where the author is choosing it.
 *
 * "If First name is Soham, go to Submit" reads as a shortcut and behaves as a deletion: four
 * questions are never asked, and two of them the author marked required. Nothing said so. The
 * first party to find out was the respondent, and the second was the author, one round of
 * testing later, reading it as a bug in requiredness rather than as the rule doing exactly what
 * they wrote.
 *
 * The count itself is computed and tested in `jump-reach.spec.ts`. What has to be true HERE is
 * that the dialog is given it and renders it against the rule being edited.
 */
describe('a destination says what it skips, while the author is picking it', () => {

  it('the dialog takes a note per destination rather than working it out itself', () => {
    // Which questions lie between two items is a fact about the FORM, and this component is
    // handed one item's rules. Deriving it here would need the whole tree passed in.
    expect(logicEditor()).toMatch(/@Input\(\) reachNotes/);
  });

  it('renders the note for the destination the rule actually holds', () => {
    expect(logicEditor()).toMatch(/reachNoteFor\(rule\)/);
  });

  it('the panel supplies them for the item being edited', () => {
    expect(panelHtml()).toMatch(/\[reachNotes\]="reachNotes"/);
  });

  it('says nothing when there is nothing to say', () => {
    // A jump to the very next question skips nothing, and a line saying "skips 0 questions"
    // beneath every destination is noise that teaches authors to stop reading it.
    expect(logicEditor()).toMatch(/@if \(reachNoteFor\(rule\); as note\)/);
  });
});

describe('the dialog subtitle describes the dialog you actually got', () => {
  it('an item with no "after this" is not promised one', () => {
    // The subtitle was concatenated unconditionally: an ending screen was told the dialog would
    // decide "where the respondent goes next", while the dialog correctly showed no jump block
    // at all, because an ending IS where they went. Same class of bug as the picker copy — the
    // words claiming something the surface right below them contradicts.
    expect(panelHtml()).not.toMatch(/'Decide when this ' \+ itemNoun/);
    expect(panelHtml()).toMatch(/\[subtitle\]="dialogSubtitle"/);
    const body = /get dialogSubtitle\(\): string \{([\s\S]*?)\n  \}/.exec(panel())?.[1] ?? '';
    expect(body).toMatch(/this\.allowJumps/);
    expect(body).toMatch(/goes next/);
  });
});

describe('the catch-all ending is STATED here, not edited here', () => {
  const logicEditorSrc = (): string => stripped('logic-editor.component.ts');

  it('the dialog reports where finishers land, and offers no way to change it', () => {
    // It IS the question an author asks while writing branching rules — the hint above says
    // "if none match, the respondent carries on", which invites "and then what?". But the
    // default ending already has one home, the Default toggle on the Endings strip, and a
    // second writer inside a per-QUESTION dialog needs a caption admitting it is form-wide.
    // A control that needs that caption has already failed; a sentence needs no caption.
    const source = logicEditorSrc();
    expect(source).toMatch(/@Input\(\) defaultEndingLabel/);
    expect(source).toMatch(/lands on/);
    expect(source).not.toMatch(/<select[^>]*defaultEnding/);
    expect(source).not.toMatch(/form-wide setting/);
  });

  it('nothing about it reaches the draft, so there is nothing to save or undo', () => {
    // The read-only line writes nothing, which is the whole point: no output, no commit
    // branch, no dirty term, and no way for a dismissed dialog to leave a change behind.
    expect(panel()).not.toMatch(/defaultEndingChange/);
    expect(stripped('logic-draft.ts')).not.toMatch(/defaultEndingId/);
  });

  it('a form with no catch-all says so, instead of claiming it has no endings', () => {
    // Two different states reach this branch — a form with no ending screens at all, and a
    // form whose every ending is screened out — and only one sentence is true of both. The
    // picker version said "this form has no ending screen to land on" while the destination
    // list two lines above was offering one.
    expect(logicEditorSrc()).toMatch(/@if \(defaultEndingLabel\)[\s\S]{0,600}\} @else \{/);
    expect(logicEditorSrc()).toMatch(/confirmation message/);
    expect(logicEditorSrc()).not.toMatch(/no ending screen to land on/);
  });

  it('the sentence flows as prose, so it wraps on a phone', () => {
    // NOT `.le-reach`, which is a flex row: it lays each child out as a flex item, so a sentence
    // with a <strong> in the middle becomes three of them — a stray 6px gap before the comma,
    // and `nowrap` means the line cannot break at all on a narrow screen.
    const source = logicEditorSrc();
    expect(source).toMatch(/class="le-finish"/);
    const rule = /\.le-finish \{([^}]*)\}/.exec(source)?.[1] ?? '';
    expect(rule).not.toMatch(/display:\s*flex/);
  });

  it('an ending screen is not told about it either', () => {
    // It sits inside the same `@if (allowJumps)` guard as the jump rules.
    const guarded = /@if \(allowJumps\) \{([\s\S]*?)\n      \}/.exec(logicEditorSrc())?.[1] ?? '';
    expect(guarded).toMatch(/defaultEndingLabel/);
  });
});

/**
 * The rail names a rule's source from the WHOLE form, not from what that rule may legally read.
 *
 * Issue #73. Naming and legality are two questions and the rail was answering both with one
 * list: after a reorder its summary read `Show only when (deleted question) is answered` about a
 * question sitting one row above it on the canvas. The badge beside it had already been taught to
 * say what really happened, so the rail was the last surface still telling the old lie.
 *
 * `rules-inventory.ts` reached this conclusion first and wrote it down — its `sources` is
 * documented as "the WHOLE form's questions, not one item's legal sources", for this reason.
 */
describe('the rules rail names a source it is no longer allowed to read', () => {
  it('resolves prompts against the form-wide list as well as the rule\'s own', () => {
    expect(panel()).toMatch(/describeCondition\(c, \[\.\.\.sources, \.\.\.this\.formSources\]\)/);
  });

  it('takes that list as an input, defaulted to empty so an unwired host degrades to the old text', () => {
    expect(panel()).toMatch(/@Input\(\) formSources: ConditionalSourceQuestion\[\] = \[\];/);
  });

  it('hands it on to the editor the dialog opens', () => {
    expect(panelHtml()).toMatch(/\[formSources\]="formSources"/);
  });
});

/**
 * The same lie, about a rule's DESTINATION.
 *
 * Issue #73 fixed it for sources and logged this: the `Go to` picker is forward-only, mirroring
 * the resolver, so a reorder that puts a target behind its rule drops it out of the offered list
 * while the thing itself sits one row up the canvas. Both the rail line and the dialog's disabled
 * option then read `(a question that no longer exists)` about something plainly present. The
 * canvas badge has always said the true thing (`UNREACHED_DESTINATION`), so the two surfaces
 * contradicted each other on the same rule.
 */
describe('the rules rail names a destination that is no longer ahead of the rule', () => {
  it('gives the label function the form-wide list as well as the offered one', () => {
    expect(panel()).toMatch(/storedTargetLabel\(jump\.target, this\.targets, this\.formTargets\)/);
    expect(logicEditor()).toMatch(/storedTargetLabel\(rule\.target, this\.targets, this\.formTargets\)/);
  });

  it('takes that list as an input, defaulted to empty so an unwired host degrades to the old text', () => {
    expect(panel()).toMatch(/@Input\(\) formTargets: JumpTargetOption\[\] = \[\];/);
    expect(logicEditor()).toMatch(/@Input\(\) formTargets: JumpTargetOption\[\] = \[\];/);
  });

  it('hands it on to the editor the dialog opens', () => {
    expect(panelHtml()).toMatch(/\[formTargets\]="formTargets"/);
  });

  it('makes the third argument REQUIRED, so a new caller has to decide rather than inherit the lie', () => {
    const module = stripped('jump-target-options.ts');
    expect(module).toMatch(/formTargets: ReadonlyArray<JumpTargetOption>,\s*\): string/);
    expect(module).not.toMatch(/formTargets: ReadonlyArray<JumpTargetOption> = \[\]/);
  });
});

describe('an unreachable destination is named, not offered', () => {
  it('disables the stale option the way the condition editor disables a stale source', () => {
    // The Go to list is forward-only precisely so an author cannot pick a destination the
    // resolver ignores — a rule that reads correctly and silently never fires. Rendering the
    // inert target as a selectable option beside the live ones gives that back. It stays the
    // SELECTION, so the rule still reads right; it is just not on offer again.
    expect(logicEditor()).toMatch(
      /@if \(staleTarget\(rule\); as stale\) \{\s*<option \[value\]="stale\.value" disabled \[selected\]="true">/,
    );
  });
});
