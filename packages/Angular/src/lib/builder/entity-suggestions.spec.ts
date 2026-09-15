import { describe, expect, it } from 'vitest';

import {
  MAX_ENTITY_RESULTS,
  SUGGESTED_ENTITY_NAMES,
  pickEntities,
  pickTargets,
  type EntityChoice,
  type NamedTarget,
} from './entity-suggestions';

const CATALOGUE: EntityChoice[] = [
  { name: 'MJ: AI Prompt Runs', label: 'AI Prompt Runs' },
  { name: 'MJ_BizApps_Common: Organizations', label: 'Organizations' },
  { name: 'MJ: Entity Field Values', label: 'Entity Field Values' },
  { name: 'MJ_BizApps_Common: People', label: 'People' },
  { name: 'MJ: Agent Run Step Personas', label: 'Agent Run Step Personas' },
];

describe('pickEntities', () => {
  it('offers the shortlist before the author has typed anything', () => {
    const picks = pickEntities(CATALOGUE, '');
    expect(picks.suggested.map((e) => e.name)).toEqual([...SUGGESTED_ENTITY_NAMES]);
    expect(picks.matches).toEqual([]);
  });

  it('omits a suggested entity this deployment does not have, rather than offering a dead row', () => {
    const withoutPeople = CATALOGUE.filter((e) => e.name !== 'MJ_BizApps_Common: People');
    expect(pickEntities(withoutPeople, '').suggested.map((e) => e.name)).toEqual([
      'MJ_BizApps_Common: Organizations',
    ]);
  });

  it('ranks a leading match above one buried in the middle', () => {
    // "People" starts with the query; "Agent Run Step Personas" merely contains it.
    const picks = pickEntities(CATALOGUE, 'pe');
    expect(picks.matches[0].label).toBe('People');
  });

  it('finds an entity by its stored name as well as its label', () => {
    expect(pickEntities(CATALOGUE, 'bizapps').matches).toHaveLength(2);
  });

  it('ignores case and punctuation', () => {
    expect(pickEntities(CATALOGUE, 'ORGANIZATIONS').matches[0].label).toBe('Organizations');
  });

  it('keeps a space significant, so a two-letter fragment does not match everything', () => {
    expect(pickEntities(CATALOGUE, 'entity field').matches.map((e) => e.label)).toEqual([
      'Entity Field Values',
    ]);
  });

  it('caps the list and says how many it left out, never truncating silently', () => {
    const many: EntityChoice[] = Array.from({ length: MAX_ENTITY_RESULTS + 4 }, (_, i) => ({
      name: `MJ: Thing ${i}`,
      label: `Thing ${i}`,
    }));
    const picks = pickEntities(many, 'thing');
    expect(picks.matches).toHaveLength(MAX_ENTITY_RESULTS);
    expect(picks.hidden).toBe(4);
  });

  it('reports an empty search rather than returning an indistinguishable empty list', () => {
    expect(pickEntities(CATALOGUE, 'zzzz')).toMatchObject({ matches: [], empty: true });
    expect(pickEntities(CATALOGUE, '').empty).toBe(false);
  });
});

describe('pickTargets', () => {
  const ACTIONS: NamedTarget[] = [
    { id: '1', name: 'Send Email', description: 'Emails somebody' },
    { id: '2', name: 'Create Task', description: null },
    { id: '3', name: 'Score Answers', description: 'Runs an LLM judge' },
  ];

  it('shows the start of the list when nothing has been typed', () => {
    // Unlike the entity picker there is no shortlist to offer: which actions matter is a
    // property of the deployment, so the honest default is the list itself.
    expect(pickTargets(ACTIONS, '').visible).toHaveLength(3);
  });

  it('matches on the description as well as the name', () => {
    expect(pickTargets(ACTIONS, 'judge').visible.map((t) => t.id)).toEqual(['3']);
  });

  it('survives a target with no description', () => {
    expect(pickTargets(ACTIONS, 'task').visible.map((t) => t.id)).toEqual(['2']);
  });

  it('caps the list and reports what it left out', () => {
    const many: NamedTarget[] = Array.from({ length: MAX_ENTITY_RESULTS + 3 }, (_, i) => ({
      id: String(i),
      name: `Action ${i}`,
    }));
    expect(pickTargets(many, '')).toMatchObject({ hidden: 3 });
    expect(pickTargets(many, '').visible).toHaveLength(MAX_ENTITY_RESULTS);
  });
});
