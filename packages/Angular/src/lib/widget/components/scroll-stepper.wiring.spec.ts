/**
 * Scroll mode advances one SECTION at a time.
 *
 * `FormScrollComponent` uses `input.required` and cannot be instantiated in this suite's node
 * environment — the constraint `submit-overlay.wiring.spec.ts` documents — so what is checkable
 * here is the source. The decisions themselves are tested for real where they are pure:
 * `section-stepper.spec.ts` for what counts as a step, `stepper.spec.ts` for the cursor clamp.
 * What is left to prove is that the component ASKS.
 *
 * Comments are stripped before every assertion: the source explains these decisions in prose,
 * and a guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const source = (): string => stripped('form-scroll.component.ts');
const template = (): string => stripped('form-scroll.component.html');

/** The body of one method, from its declaration to its closing brace. */
function methodBody(declaration: string): string {
  const src = source();
  const start = src.indexOf(declaration);
  expect(start, `${declaration} not found`).toBeGreaterThan(-1);
  const body = src.slice(start);
  return body.slice(0, body.indexOf('\n  }\n'));
}

describe('the cursor counts sections, not pages', () => {
  it('steps over the sections that render something', () => {
    // `visiblePages()` alone includes a section whose questions are all hidden — a whole step
    // with nothing on it. See section-stepper.ts.
    expect(source()).toMatch(/steppableSections\(/);
  });

  it('re-clamps when a rule resizes the path', () => {
    // A jump firing on the last section shortens the list under the cursor; without the clamp
    // the cursor points past the end and the respondent sees an empty screen.
    expect(source()).toMatch(/clampCursor\(/);
  });

  it('renders one section, not the whole stack', () => {
    const html = template();
    expect(html).toMatch(/@if \(current\(\); as page\)/);
    expect(html).not.toMatch(/@for \(page of pages\(\)/);
  });
});

describe('advancing is a checkpoint, not a submit', () => {
  it('validates the section being left, and only that section', () => {
    const body = methodBody('protected onNext');
    expect(body).toMatch(/questionsFor\(/);
    expect(body).toMatch(/touchAll\(/);
    expect(body).toMatch(/areValid\(/);
  });

  it('banks progress and judges a knockout once the section is behind us', () => {
    const body = methodBody('protected onNext');
    expect(body).toMatch(/progressChange\.emit\(\)/);
    expect(body).toMatch(/commitChange\.emit\(\)/);
  });

  it('only the last section submits', () => {
    expect(methodBody('protected onNext')).toMatch(/isLast\(\)[\s\S]*?submit\.emit\(\)/);
  });
});

describe('the captcha gate belongs to the submit, not to every Next', () => {
  it('disables the primary control on the final section only', () => {
    // `submitDisabled` is "the challenge is unsolved". Applied to Next it would strand a
    // respondent on section one of every captcha-gated form, unable to reach the challenge.
    expect(source()).toMatch(/primaryDisabled[\s\S]{0,200}?isLast\(\)[\s\S]{0,80}?submitDisabled\(\)/);
  });
});

describe('a submit still answers for the whole form', () => {
  it('checks every visible question, not just the last section', () => {
    // Reaching the last section proves each section validated as it was left, which is not the
    // same claim as "the form is valid now" — going Back and clearing a required field is one
    // way to break it.
    expect(methodBody('protected onSubmit')).toMatch(/visibleAnswerableQuestions\(\)/);
  });

  it('takes the respondent back to the section holding the problem', () => {
    // The old renderer called focus() on a field that could be anywhere in a long scroll. With
    // one section on screen the field may not be rendered at all, so focusing it does nothing
    // and the form simply refuses to submit with no visible reason.
    const src = source();
    expect(src).toMatch(/sectionOf\(/);
    expect(methodBody('private revealFirstInvalid')).toMatch(/setIndex\(/);
  });

  it('keeps the native submit from navigating', () => {
    // Without preventDefault the browser runs its default GET submit, which unmounts the widget
    // mid-request and loses the answers.
    expect(methodBody('protected onSubmit')).toMatch(/preventDefault\(\)/);
  });
});

describe('the respondent can go back', () => {
  it('has a Back control, disabled on the first section', () => {
    const html = template();
    expect(html).toMatch(/onBack\(\)/);
    expect(html).toMatch(/isFirst\(\)/);
  });

  it('going back never re-validates what is ahead', () => {
    // Back is navigation, not a commit: validating on the way back would show errors for
    // questions the respondent has not reached.
    const body = methodBody('protected onBack');
    expect(body).not.toMatch(/areValid\(|touchAll\(/);
  });
});

/**
 * The native `submit` event must not escape this component.
 *
 * This is the bug that made every Next press submit the form, and it is not obvious from either
 * file on its own. Angular 21's `listenerInternal` (`@angular/core`, `_debug_node-chunk.mjs`)
 * wires a template listener like this:
 *
 *     if (tNode.type & 3 || eventTargetResolver) {
 *       const hasCoalescedDomEvent = listenToDomEvent(...);
 *       if (hasCoalescedDomEvent) processOutputs = false;
 *     }
 *     if (processOutputs) { ...listenToOutput(...)... }
 *
 * A component host element satisfies `tNode.type & 3`, so `(submit)="onSubmit()"` on
 * `<mjf-form-scroll>` in `mj-form.component.html` registers a DOM listener **as well as**
 * subscribing to this component's `submit` output. Native `submit` bubbles. So the inner
 * `<form>`'s event reaches the host element and calls the parent's submit handler — with no
 * output ever emitted, and `preventDefault()` powerless to stop it, because preventing the
 * default action is not the same as stopping propagation.
 *
 * It was invisible while Submit was the only button: the parent got the event twice, and its
 * `shouldIgnoreSubmit(phase)` re-entrancy guard swallowed the second. The moment the same
 * element became **Next**, the bubbled event was the whole submission.
 *
 * It is also an embed hazard independent of the naming: this widget ships as a custom element
 * dropped into somebody else's page, and a `submit` event escaping it can trip that page's own
 * form handling.
 */
describe('the inner form is this component\'s business alone', () => {
  it('stops the native submit from bubbling out of the component', () => {
    const body = methodBody('protected onSubmit');
    expect(body).toMatch(/stopPropagation\(\)/);
  });

  it('and still prevents the default navigation', () => {
    // Two different jobs: stopPropagation keeps the parent from seeing it, preventDefault keeps
    // the browser from running a GET navigation that unmounts the widget mid-request.
    expect(methodBody('protected onSubmit')).toMatch(/preventDefault\(\)/);
  });

  it('the only way out is the output, which the parent listens to', () => {
    expect(source()).toMatch(/submit = output<void>\(\)/);
    expect(template()).toMatch(/\(submit\)="onSubmit\(\$event\)"/);
  });
});

/**
 * Questions that vanish say why.
 *
 * A `Go to` pointing inside the section on screen removes the questions between it and its
 * target while the respondent is looking at them. Section stepping fixed the cross-section case;
 * this is the one that is left, and with nothing said it reads as a glitch rather than as logic.
 *
 * The decisions — which absences are worth mentioning, and what the line says — are tested for
 * real in `section-content.spec.ts`. What is left to prove here is that the renderer asks, and
 * renders the answer where the questions were.
 */
describe('a section says what it stopped asking', () => {
  it('renders entries, not a bare question list', () => {
    const html = template();
    expect(html).toMatch(/@for \(entry of entriesFor\(page\); track/);
    expect(html).not.toMatch(/@for \(q of questionsFor\(page\); track q\.id\)/);
  });

  it('asks the shared reader which absences are worth a word', () => {
    // Not "every question missing from the page": one hidden by its own show rule was never on
    // screen, and announcing it would narrate the form's structure on every unused follow-up.
    expect(source()).toMatch(/sectionEntries\(/);
  });

  it('uses the one wording, rather than composing a second copy in the template', () => {
    expect(source()).toMatch(/skippedMessage\(/);
  });

  it('the marker is not announced as an alert', () => {
    // It is context, not an error. `role="alert"` would interrupt a screen reader mid-question
    // and re-announce on every keystroke that changes the run.
    const html = template();
    const marker = html.slice(html.indexOf('mjf-skipped'));
    expect(marker).not.toMatch(/role="alert"/);
  });
});
