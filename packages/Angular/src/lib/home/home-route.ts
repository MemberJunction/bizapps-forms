/**
 * The Forms home's own Explorer URL.
 *
 * Explorer routes an app's dashboard as `/app/:appName` (the app's default nav item) or
 * `/app/:appName/:navItemName` (`app-routing.module.ts` in MJ's explorer-core). The Forms app's
 * default nav item is labelled "Forms" (`metadata/applications/.applications.json`), and a
 * resource-style link to the same dashboard is `/app/:appName/dashboard/:dashboardId`. The app
 * name is matched case-insensitively, as Explorer does. Query string, hash, trailing slash and any
 * base-href prefix before `/app/` are ignored.
 *
 * Deliberately a whitelist of this dashboard's own spellings: the sibling "Responses & Analytics"
 * dashboard and entity records opened inside the Forms app must NOT match.
 */
const APP_SEGMENT = 'forms';
const HOME_NAV_ITEM = 'forms';
/** The Forms home dashboard's record id (`metadata/dashboards/.dashboards.json`), lowercased. */
const HOME_DASHBOARD_ID = '3f8a6b12-9c4d-4e7a-b1f2-5a6d7e8c9012';

export function isFormsHomeUrl(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  const segments = path
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => safeDecode(s).toLowerCase());
  const at = segments.indexOf('app');
  if (at < 0 || segments[at + 1] !== APP_SEGMENT) return false;
  const rest = segments.slice(at + 2);
  if (rest.length === 0) return true;
  if (rest.length === 1) return rest[0] === HOME_NAV_ITEM;
  return rest.length === 2 && rest[0] === 'dashboard' && rest[1] === HOME_DASHBOARD_ID;
}

/**
 * A malformed escape in a URL we do not own must not throw inside a navigation callback. The raw
 * segment is kept: it cannot equal any of the (plain ASCII) names matched above, so it reads as
 * "not the Forms home", which is the correct answer for a URL Explorer itself could not have built.
 */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
