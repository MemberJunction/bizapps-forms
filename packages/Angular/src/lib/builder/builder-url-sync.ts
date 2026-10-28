/**
 * The builder's view in the URL (UI audit F09): which tab is open, and on Responses, the table's
 * page, sort and search and the open response.
 *
 * WHY THIS IS NOT `UpdateQueryParams`. Home and Analytics are MJ dashboards and use
 * `BaseResourceComponent`'s tab-scoped query params. The builder is a record form
 * (`BaseFormComponent`), and MJ 6.1.6 gives a record form neither a tab id nor a query-param hook:
 * the record resource that hosts it holds the tab id and passes nothing down. The tab registry that
 * could map this record to its tab (`WorkspaceStateManager`) lives in a package forms-ng does not
 * depend on. So this adapter writes through `NavigationService.UpdateActiveTabQueryParams`, and
 * makes that safe the only way available: it reads and writes ONLY while the address bar names this
 * record. Explorer's shell keeps the address bar on the active tab, so "the URL is this form's"
 * means "the active tab is this builder" — the write cannot land on another tab, which is the
 * failure MJ deprecated the active-tab call over. A builder in a background tab neither reads
 * another tab's URL nor writes to it. When MJ gives record forms a tab-scoped hook, only this file
 * changes.
 */
import { builderViewFromParams, builderViewToParams, urlNamesRecord, type BuilderView } from '../shared/view-urls';

/** What the adapter needs from the host: the address bar, its changes, and the active-tab write. */
export interface BuilderUrlPorts {
  path(): string;
  onUrlChange(fn: (url: string) => void): () => void;
  writeActiveTab(params: Record<string, string | null>): void;
}

export class BuilderUrlSync {
  private lastWritten: string | null = null;
  private stopWatching: (() => void) | null = null;

  constructor(
    private readonly recordId: string,
    private readonly ports: BuilderUrlPorts,
  ) {}

  /** The view the address bar names for this form, or null while it shows another tab. */
  public Read(): BuilderView | null {
    const url = this.ports.path();
    return urlNamesRecord(url, this.recordId) ? builderViewFromParams(paramsOf(url)) : null;
  }

  /** Keep `view` in the URL — only while this builder's tab is the one showing. */
  public Write(view: BuilderView): void {
    if (!urlNamesRecord(this.ports.path(), this.recordId)) {
      return;
    }
    const params = builderViewToParams(view);
    this.lastWritten = keyOf(builderViewFromParams(present(params)));
    this.ports.writeActiveTab(params);
  }

  /** Call `apply` when back / forward changes this form's URL to a view this builder did not write. */
  public Watch(apply: (view: BuilderView) => void): void {
    this.Stop();
    this.stopWatching = this.ports.onUrlChange((url) => {
      if (!urlNamesRecord(url, this.recordId)) {
        return;
      }
      const view = builderViewFromParams(paramsOf(url));
      const key = keyOf(view);
      if (key === this.lastWritten) {
        return;
      }
      this.lastWritten = key;
      apply(view);
    });
  }

  public Stop(): void {
    this.stopWatching?.();
    this.stopWatching = null;
  }
}

function paramsOf(url: string): Record<string, string> {
  const query = url.split('#', 1)[0].split('?')[1] ?? '';
  // forEach, not Object.fromEntries(params): the library build's `lib` has no DOM.Iterable.
  const params: Record<string, string> = {};
  new URLSearchParams(query).forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/** The params a write leaves in the URL (a `null` removes its key). */
function present(params: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(params).filter((e): e is [string, string] => e[1] !== null));
}

function keyOf(view: BuilderView): string {
  return JSON.stringify(view);
}
