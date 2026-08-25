/**
 * Unit tests for the unregistered-entity-class guard.
 *
 * The guard's whole job is to convert MJ's silent BaseEntity fallback into a message an operator
 * can act on, so both halves are worth pinning: it must stay quiet for entities that ARE
 * registered (or it fails every action on a healthy host), and it must name the ones that are not.
 */
import { describe, it, expect } from 'vitest';
import { explainMissingEntityClasses } from './generated-entity';
// Registers the sibling apps' entity classes, so the "healthy host" cases below have something
// to find. Production gets this from `custom/register.ts`; `register.spec.ts` pins that.
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/tasks-entities';

/** No app will ever own this. Its absence from the class factory is the point. */
const UNREGISTERED = 'MJ_BizApps_Nowhere: Imaginary Widgets';

describe('explainMissingEntityClasses', () => {
  it('returns null when every entity has a generated class registered', () => {
    expect(
      explainMissingEntityClasses(['MJ_BizApps_Common: People', 'MJ_BizApps_Tasks: Tasks']),
    ).toBeNull();
  });

  it('returns null for an empty list rather than a vacuous complaint', () => {
    expect(explainMissingEntityClasses([])).toBeNull();
  });

  it('names the unregistered entity, and says what the fallback would do instead', () => {
    const explanation = explainMissingEntityClasses([UNREGISTERED]);

    expect(explanation).toContain(UNREGISTERED);
    // The message has to carry the CONSEQUENCE, not just the fact. "Not registered" reads as
    // harmless; "would save as nulls" is what makes an operator act on it.
    expect(explanation).toContain('silently discard');
  });

  it('reports every unregistered entity, not just the first', () => {
    const explanation = explainMissingEntityClasses([
      UNREGISTERED,
      'MJ_BizApps_Common: People',
      `${UNREGISTERED} II`,
    ]);

    expect(explanation).toContain(UNREGISTERED);
    expect(explanation).toContain(`${UNREGISTERED} II`);
    // A registered entity in the same batch must not be blamed alongside them.
    expect(explanation).not.toContain('MJ_BizApps_Common: People');
  });
});
