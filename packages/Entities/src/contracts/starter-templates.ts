/**
 * The built-in starter template catalogue — key, display name, description, icon.
 *
 * WHY THIS LIVES IN THE CONTRACT PACKAGE. There were two of these lists: the blueprints in
 * `forms-actions` (`starter-templates.ts`) and a key/label/icon copy in `forms-ng`
 * (`home-models.ts`), the second carrying a comment insisting its keys "MUST match" the
 * first's. They had already drifted — `nps` was a star in one list and a gauge in the other,
 * `lead-capture` a user-plus and a magnet — which is the mild version of the failure. The
 * severe version is a key drifting, because the gallery then offers a template the action
 * rejects as UNKNOWN_TEMPLATE, and nothing catches it until a user clicks it.
 *
 * So the *identity* of a starter is declared once, here, in the package both sides already
 * depend on. The blueprints stay in forms-actions, keyed by {@link StarterTemplateKey} in a
 * total `Record`, so a key added here fails that package's compile until its blueprint
 * exists. Drift is no longer a thing anyone has to remember.
 *
 * These are BUILT-IN and code-authored on purpose — they are not rows. A seeded starter would
 * be deletable, and deleting "Contact form" would delete it for everyone on the host.
 * User-saved templates are a different thing entirely: real `Form` rows with `IsTemplate = 1`.
 */

/** The stable keys the `Forms: Create Form From Template` action accepts. */
export const STARTER_TEMPLATE_KEYS = [
  'contact',
  'rsvp',
  'nps',
  'lead-capture',
  'application',
] as const;

export type StarterTemplateKey = (typeof STARTER_TEMPLATE_KEYS)[number];

/** Display metadata for one starter — everything a gallery card needs, and nothing more. */
export interface StarterTemplateInfo {
  key: StarterTemplateKey;
  name: string;
  description: string;
  /** Font Awesome class. Free-tier only: Pro icons render as an empty box. */
  icon: string;
}

/** The starter gallery, in display order. */
export const STARTER_TEMPLATE_CATALOG: readonly StarterTemplateInfo[] = [
  {
    key: 'contact',
    name: 'Contact form',
    description: 'Name, email and a message — the general-enquiry default.',
    icon: 'fa-solid fa-envelope',
  },
  {
    key: 'rsvp',
    name: 'Event RSVP',
    description: 'Attendance, a guest count and dietary restrictions.',
    icon: 'fa-solid fa-calendar-check',
  },
  {
    key: 'nps',
    name: 'NPS / feedback',
    description: 'A Net Promoter Score question plus an open-ended follow-up.',
    icon: 'fa-solid fa-gauge-high',
  },
  {
    key: 'lead-capture',
    name: 'Lead capture',
    description: "A prospect's contact details and what they are interested in.",
    icon: 'fa-solid fa-magnet',
  },
  {
    key: 'application',
    name: 'Application',
    description: 'A multi-section application with a resume upload.',
    icon: 'fa-solid fa-file-signature',
  },
] as const;

/**
 * Look up a starter by key, case-insensitively. Returns undefined for anything unknown —
 * callers decide whether that is a user error or a bug, and neither should be a throw here.
 */
export function starterTemplateInfo(key: string): StarterTemplateInfo | undefined {
  const target = key.trim().toLowerCase();
  return STARTER_TEMPLATE_CATALOG.find((t) => t.key === target);
}

/** Narrowing guard for a string that may or may not name a starter. */
export function isStarterTemplateKey(key: string): key is StarterTemplateKey {
  return STARTER_TEMPLATE_CATALOG.some((t) => t.key === key);
}
