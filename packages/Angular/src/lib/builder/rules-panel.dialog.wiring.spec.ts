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

  it('Done is disabled until the draft would persist something', () => {
    expect(dialog()).toMatch(/\[disabled\]="!canConfirm"/);
    expect(panelHtml()).toMatch(/\[canConfirm\]="canCommit"/);
    expect(panel()).toMatch(/get canCommit\(\)[\s\S]{0,200}isDraftCommittable/);
  });

  it('the condition editor is reached only through the dialog', () => {
    const html = panelHtml();
    expect(html).toMatch(/<mjf-rule-editor-dialog/);
    const dialogStart = html.indexOf('<mjf-rule-editor-dialog');
    expect(html.indexOf('<mjf-conditional-rule-editor')).toBeGreaterThan(dialogStart);
  });

  it('a card no longer expands in place', () => {
    expect(panelHtml()).not.toMatch(/isExpanded/);
    expect(panelHtml()).not.toMatch(/rp-chevron/);
    expect(panel()).not.toMatch(/toggleExpanded/);
  });

  it('one nullable union replaces the two flags that were never legally both set', () => {
    expect(panel()).toMatch(/type RuleDialog\s*=[\s\S]{0,200}'pick'[\s\S]{0,200}'edit'/);
    expect(panel()).not.toMatch(/pickerOpen/);
    expect(panel()).not.toMatch(/protected expanded/);
  });

  it('clicking an existing card opens that verb in the dialog', () => {
    expect(panelHtml()).toMatch(/\(click\)="editCard\(card\.verb\)"/);
    // editCard delegates, so assert the chain rather than a flattened body: both entry points
    // go through openDraft, which is what snapshots the baseline the discard warning needs.
    expect(panel()).toMatch(/editCard\(verb: RuleVerb\): void \{\s*this\.openDraft\(verb\);/);
    expect(panel()).toMatch(/addCard\(verb: RuleVerb\): void \{[\s\S]{0,600}this\.openDraft\(verb\);/);
    expect(panel()).toMatch(/openDraft\([\s\S]{0,600}mode:\s*'edit'/);
  });

  it('removing the card being edited closes the dialog rather than leaving it on a dead verb', () => {
    expect(panel()).toMatch(/removeCard\([\s\S]{0,400}this\.dialog\s*=\s*null/);
  });

  it('changing the selected item closes the dialog', () => {
    expect(panel()).toMatch(/set subjectId\([\s\S]{0,400}this\.dialog\s*=\s*null/);
  });
});

describe('the panel header is the only add affordance', () => {
  it('it is labelled RULES', () => {
    expect(panelHtml()).toMatch(/RULES/);
  });

  it('the plus is an icon button with an accessible name, not a text button', () => {
    const html = panelHtml();
    expect(html).toMatch(/class="rp-add"[\s\S]{0,300}fa-plus/);
    expect(html).not.toMatch(/Add rule</);
    expect(html).toMatch(/aria-label="Add rule"/);
  });

  it('the inline picker list is gone from the rail', () => {
    expect(panelHtml()).not.toMatch(/rp-picker|rp-cancel/);
  });

  it('the plus is hidden once every verb is in use, rather than opening an empty picker', () => {
    expect(panelHtml()).toMatch(/@if \(availableCards\.length > 0\)/);
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
    // THE DEFECT this replaces: `onGroupChange` emitted `ruleChange` on every keystroke, so
    // opening a card and closing it left an empty rule behind — a card reading "No conditions
    // yet" that the author never asked for and had to hunt down to remove.
    expect(panel()).toMatch(/onGroupChange\([\s\S]{0,400}this\.draftGroup\s*=/);
    const body = /onGroupChange\(([\s\S]*?)\n  \}/.exec(panel())?.[1] ?? '';
    expect(body).not.toMatch(/ruleChange\.emit/);
    expect(body).not.toMatch(/disqualifyChange\.emit/);
  });

  it('setting a jump target does not touch the item either', () => {
    const body = /setJumpTarget\(([\s\S]*?)\n  \}/.exec(panel())?.[1] ?? '';
    expect(body).not.toMatch(/ruleChange\.emit/);
  });

  it('commit is where an authored rule is written', () => {
    expect(panel()).toMatch(/commit\(\)[\s\S]{0,900}this\.ruleChange\.emit/);
  });

  it('opening a draft writes nothing', () => {
    // Deliberately not "commit is the only writer": removeCard persists too, and a removal IS
    // a write. What must not write is any step on the way IN to editing.
    const body = /openDraft\(([\s\S]*?)\n  \}/.exec(panel())?.[1] ?? '';
    expect(body).not.toMatch(/emit/);
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

  it('a card shows only because the item carries the verb', () => {
    expect(panel()).toMatch(/isOn\(verb: RuleVerb\): boolean \{\s*return hasVerb\(this\.rule, verb\);/);
  });
});

describe('closing asks only when there is something to lose', () => {
  it('a dismissal with no edits closes and adds nothing', () => {
    expect(panel()).toMatch(/requestClose\(\)[\s\S]{0,500}isDraftDirty/);
    // The clean path closes; closeDialog is the one place that tears the dialog down, so the
    // draft cannot outlive it and leak onto the next item.
    const body = /requestClose\(\): void \{([\s\S]*?)\n  \}/.exec(panel())?.[1] ?? '';
    expect(body).toMatch(/this\.closeDialog\(\)/);
    expect(panel()).toMatch(/closeDialog\(\): void \{[\s\S]{0,300}this\.dialog\s*=\s*null[\s\S]{0,200}this\.clearDraft\(\)/);
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
    expect(panel()).toMatch(/clearDraft\(\): void \{[\s\S]{0,300}this\.baseline\s*=\s*null/);
    expect(panel()).toMatch(/set subjectId\([\s\S]{0,400}this\.clearDraft\(\)/);
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

  it('the picker has no draft to lose, so it never warns', () => {
    expect(panel()).toMatch(/requestClose\(\)[\s\S]{0,200}mode\s*!==\s*'edit'/);
  });
});
