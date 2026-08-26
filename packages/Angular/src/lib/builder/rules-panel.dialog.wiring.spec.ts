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

describe('the rule editor is a modal, not a rail expansion', () => {
  it('the dialog covers the viewport and centers its card, like the image picker', () => {
    const css = dialog();
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/inset:\s*0/);
    expect(css).toMatch(/align-items:\s*center/);
    expect(css).toMatch(/justify-content:\s*center/);
  });

  it('it is wider than the rail it replaces — the whole point of the change', () => {
    const width = /width:\s*min\((\d+)px,\s*100%\)/.exec(dialog());
    expect(width).not.toBeNull();
    expect(Number(width?.[1])).toBeGreaterThan(600);
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

  it('the header button has an accessible name', () => {
    const html = panelHtml();
    expect(html).toMatch(/class="rp-add"/);
    expect(html).toMatch(/aria-label="Edit logic"/);
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
    expect(panel()).toMatch(/closeDialog\(\): void \{[\s\S]{0,400}this\.draft = \{ show: undefined, jumps: \[\] \}/);
    expect(panel()).toMatch(/closeDialog\(\): void \{[\s\S]{0,400}this\.baseline = \{ show: undefined, jumps: \[\] \}/);
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
