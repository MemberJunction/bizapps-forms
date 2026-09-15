/**
 * Choosing which entity a form writes into, without reading the whole catalogue.
 *
 * THE PROBLEM THIS SOLVES. The old tab offered a native `<select>` containing every entity in
 * the installation that accepts a write — in a real MemberJunction deployment that is hundreds of
 * options, alphabetical, with no grouping and no search. Hick's Law is the polite objection; the
 * practical one is that the list is mostly wrong answers. `AIPromptRun` is writable. So is
 * `EntityFieldValue`. An author looking for "People" scrolls past dozens of core plumbing tables
 * to find it, and every one of them is a mapping that would technically save.
 *
 * So: type to search, at most a handful of results, and — before any typing — the two or three
 * entities a form realistically writes into. Search beats scroll once a list stops fitting on a
 * screen, and a shortlist beats search for the case that is overwhelmingly the common one.
 *
 * Pure and framework-free: the ranking is the part worth testing, and it needs no DOM.
 */

/** One offerable entity, already reduced to what the picker shows. */
export interface EntityChoice {
  /** The MJ entity name — what gets stored. */
  name: string;
  /** What the author reads. */
  label: string;
  /** The schema it lives in, shown to disambiguate same-named entities. */
  schema?: string | null;
}

/**
 * The entities a form is most likely to write into, in the order they are offered.
 *
 * These are Forms' own hard dependencies — `bizapps-common` Person/Organization are declared in
 * `mj-app.json` and are the identity records the rest of the stack already runs on. Anything not
 * on this list is still one keystroke away; the list only decides what is visible before the
 * author has said anything.
 */
export const SUGGESTED_ENTITY_NAMES: readonly string[] = [
  'MJ_BizApps_Common: People',
  'MJ_BizApps_Common: Organizations',
];

/**
 * How many search results to show at once.
 *
 * Small on purpose. A picker that answers a two-letter query with forty rows has moved the
 * scrolling problem rather than solved it; the honest response to a vague query is to say how
 * many were left out and let the author be more specific.
 */
export const MAX_ENTITY_RESULTS = 8;

/** What the picker renders for one query. */
export interface EntityPicks {
  /** The shortlist, shown only before the author has typed anything. */
  suggested: EntityChoice[];
  /** Matches for the current query, capped at {@link MAX_ENTITY_RESULTS}. */
  matches: EntityChoice[];
  /** Matches that did not fit, so the cap is never silent. */
  hidden: number;
  /** True when a query was given and matched nothing. */
  empty: boolean;
}

/**
 * Rank the catalogue against what the author has typed.
 *
 * Ranking rather than filtering, because "person" should surface `People` above
 * `AI Agent Run Step Personas`: a match at the start of the name is a much better guess than a
 * match buried in the middle, and alphabetical order expresses no preference at all. Ties keep
 * catalogue order so the list does not reshuffle as someone types a longer word.
 */
export function pickEntities(all: readonly EntityChoice[], query: string): EntityPicks {
  const q = normalize(query);
  if (q.length === 0) {
    const suggested = SUGGESTED_ENTITY_NAMES.map((n) => all.find((e) => e.name === n)).filter(
      (e): e is EntityChoice => e !== undefined,
    );
    return { suggested, matches: [], hidden: 0, empty: false };
  }

  const scored = all
    .map((entity, index) => ({ entity, index, score: scoreEntity(entity, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));

  return {
    suggested: [],
    matches: scored.slice(0, MAX_ENTITY_RESULTS).map((row) => row.entity),
    hidden: Math.max(0, scored.length - MAX_ENTITY_RESULTS),
    empty: scored.length === 0,
  };
}

/** 3 = label starts with the query, 2 = label contains it, 1 = the entity name contains it. */
function scoreEntity(entity: EntityChoice, query: string): number {
  const label = normalize(entity.label);
  if (label.startsWith(query)) {
    return 3;
  }
  if (label.includes(query)) {
    return 2;
  }
  return normalize(entity.name).includes(query) ? 1 : 0;
}

/**
 * Case- and punctuation-insensitive, so `MJ_BizApps_Common: People` is found by typing `people`
 * and `first name` finds `FirstName`. Spaces are kept: dropping them would let `on` match
 * `Organization`, which is noise rather than help.
 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

/* -------------------------------------------------------------------------------------------- */

/**
 * The same problem for Actions and Agents: one choice out of a list nobody wants to read.
 *
 * Kept beside {@link pickEntities} because it is the same decision — how much of a long catalogue
 * to put on screen — but it is deliberately NOT the same function. An empty entity query means
 * "here are the two you probably want", while an empty action query means "here is the start of
 * the list": there is no shortlist of likely actions to offer, because which ones matter is
 * entirely a property of the deployment.
 */
export interface NamedTarget {
  id: string;
  name: string;
  description?: string | null;
}

/** What the Action/Agent picker renders for one query. */
export interface TargetPicks {
  visible: NamedTarget[];
  /** How many were left out, so the cap is never silent. */
  hidden: number;
}

/** Filter a target list by name or description, capped at {@link MAX_ENTITY_RESULTS}. */
export function pickTargets(all: readonly NamedTarget[], query: string): TargetPicks {
  const q = query.trim().toLowerCase();
  const matched = q.length === 0 ? [...all] : all.filter((t) => matchesTarget(t, q));
  return {
    visible: matched.slice(0, MAX_ENTITY_RESULTS),
    hidden: Math.max(0, matched.length - MAX_ENTITY_RESULTS),
  };
}

function matchesTarget(target: NamedTarget, query: string): boolean {
  return (
    target.name.toLowerCase().includes(query) ||
    (target.description ?? '').toLowerCase().includes(query)
  );
}
