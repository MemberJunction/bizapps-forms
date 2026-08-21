/**
 * The definition-input reload decision, tested as a decision.
 *
 * The predicate this covers used to live inside `MjFormComponent`, where the only reachable test
 * was a regex over the component's source. That guard could be INVERTED — reload never instead of
 * reload always — with the word `firstChange` still present and every assertion still green. These
 * cases fail on the inversion, which is the whole reason the predicate moved out.
 */
import { describe, expect, it } from 'vitest';
import { DEFINITION_INPUT_KEY, shouldReloadOnDefinitionChange } from './definition-change';

const change = (firstChange: boolean) => ({ [DEFINITION_INPUT_KEY]: { firstChange } });

describe('shouldReloadOnDefinitionChange', () => {
  it('reloads when the host hands over a different definition', () => {
    // The Design tab's stage outlives the edit, so this is the only thing that refreshes it.
    expect(shouldReloadOnDefinitionChange(change(false))).toBe(true);
  });

  it('does NOT reload on the first change, which ngOnInit already covers', () => {
    // ngOnChanges fires before the first ngOnInit. Reloading here loads twice on every mount and
    // mints two client response ids for one form.
    expect(shouldReloadOnDefinitionChange(change(true))).toBe(false);
  });

  it('does nothing when the definition is not among the changed inputs', () => {
    // A real respondent passes `slug` and never `definition`; ngOnInit stays their only load.
    expect(shouldReloadOnDefinitionChange({ slug: { firstChange: false } })).toBe(false);
    expect(shouldReloadOnDefinitionChange({})).toBe(false);
  });

  it('keys off the PROPERTY name, not the `definition` template alias', () => {
    // Reading changes['definition'] compiles, is always undefined, and makes the hook never fire.
    expect(shouldReloadOnDefinitionChange({ definition: { firstChange: false } })).toBe(false);
    expect(DEFINITION_INPUT_KEY).toBe('definitionInput');
  });
});
