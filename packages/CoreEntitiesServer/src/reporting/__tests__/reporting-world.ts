/**
 * An emulated Forms database for the reporting specs: the fake provider's tables (forms, versions,
 * responses, answers, and the detail view's satellites) plus the three reporting queries answered by
 * a TypeScript reading of their SQL (`metadata/queries/SQL/*.sql`), evaluated against the same live
 * tables. The emulation is what lets the engine run end to end without a database; the opt-in
 * integration spec (`FormReportingEngine.integration.spec.ts`) runs the real SQL.
 *
 * Each emulated query follows its SQL clause by clause, and says so where a rule is easy to miss.
 */
import type { UserInfo } from '@memberjunction/core';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { makeFakeProvider, type FakeProvider, type FakeProviderConfig, type FakeRow } from '../../testing/index.js';
import { REPORT_QUERY } from '../report-queries.js';

export const FORMS = 'MJ_BizApps_Forms: Forms';
export const VERSIONS = 'MJ_BizApps_Forms: Form Versions';
export const RESPONSES = 'MJ_BizApps_Forms: Form Responses';
export const ANSWERS = 'MJ_BizApps_Forms: Form Response Answers';
export const RUNS = 'MJ_BizApps_Forms: Form Automation Runs';
export const LEDGER = 'MJ_BizApps_Forms: Form Entity Binding Records';
export const UPLOADS = 'MJ_BizApps_Forms: Form Uploads';

export const READER = { ID: 'reader-1', Name: 'Reader', IsMagicLinkAnonymous: false, MagicLinkScope: undefined } as unknown as UserInfo;
export const SYSTEM = { ID: 'system-1', Name: 'System', IsMagicLinkAnonymous: false, MagicLinkScope: undefined } as unknown as UserInfo;

/** The rows a reporting world starts with; anything absent is an empty table. */
export interface ReportingFixture {
  forms?: FakeRow[];
  versions?: FakeRow[];
  responses?: FakeRow[];
  answers?: FakeRow[];
  runs?: FakeRow[];
  ledger?: FakeRow[];
  uploads?: FakeRow[];
}

/** A reporting world: the fake provider over the fixture's tables, with the queries emulated. */
export function reportingWorld(fixture: ReportingFixture, config: Omit<FakeProviderConfig, 'tables'> = {}): FakeProvider {
  const live: { tables: Record<string, FakeRow[]> } = { tables: {} };
  const db = makeFakeProvider({
    ...config,
    tables: {
      [FORMS]: fixture.forms ?? [],
      [VERSIONS]: fixture.versions ?? [],
      [RESPONSES]: fixture.responses ?? [],
      [ANSWERS]: fixture.answers ?? [],
      [RUNS]: fixture.runs ?? [],
      [LEDGER]: fixture.ledger ?? [],
      [UPLOADS]: fixture.uploads ?? [],
    },
    queries: {
      [REPORT_QUERY.CompletionStats]: (p) => completionStats(live.tables, p),
      [REPORT_QUERY.ValueCounts]: (p) => valueCounts(live.tables, p),
      [REPORT_QUERY.FunnelReach]: (p) => funnelReach(live.tables, p),
      ...config.queries,
    },
  });
  live.tables = db.tables;
  return db;
}

const fold = (id: unknown): string => String(id ?? '').toLowerCase();

/** `scoped`: the form's responses, narrowed to the version when one is given. */
function scopedResponses(tables: Record<string, FakeRow[]>, p: Record<string, unknown>): FakeRow[] {
  return tables[RESPONSES].filter((r) => fold(r.FormID) === fold(p.FormID) && (!p.FormVersionID || fold(r.FormVersionID) === fold(p.FormVersionID)));
}

function instant(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `Forms: Response Completion Stats`. */
function completionStats(tables: Record<string, FakeRow[]>, p: Record<string, unknown>): Record<string, unknown>[] {
  const scoped = scopedResponses(tables, p);
  const complete = scoped.filter((r) => r.Status === 'Complete');
  const seconds = complete
    .map((r) => {
      const started = instant(r.StartedAt);
      const submitted = instant(r.SubmittedAt);
      return started && submitted ? submitted.getTime() - started.getTime() : null;
    })
    .filter((ms): ms is number => ms !== null && ms >= 0 && ms <= 86_400_000)
    .map((ms) => ms / 1000)
    .sort((a, b) => a - b);
  // PERCENTILE_CONT(0.5): the middle value, or the mean of the two middle values.
  const mid = Math.floor(seconds.length / 2);
  const median = seconds.length === 0 ? null : seconds.length % 2 === 1 ? seconds[mid] : (seconds[mid - 1] + seconds[mid]) / 2;
  const submittedTimes = complete.map((r) => instant(r.SubmittedAt)).filter((d): d is Date => d !== null);
  return [
    {
      CompleteCount: complete.length,
      PartialCount: scoped.filter((r) => r.Status === 'Partial').length,
      DisqualifiedCount: scoped.filter((r) => r.Status === 'Disqualified').length,
      StartedCount: scoped.length,
      MedianCompletionSeconds: median,
      LastSubmittedAt: submittedTimes.length ? new Date(Math.max(...submittedTimes.map((d) => d.getTime()))) : null,
    },
  ];
}

/** What `ISJSON(x) = 1 AND LEFT(LTRIM(x), 1) = '['` admits, parsed. */
function jsonArray(raw: unknown): unknown[] | null {
  if (typeof raw !== 'string' || !raw.trimStart().startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** `Forms: Question Answer Value Counts`. */
function valueCounts(tables: Record<string, FakeRow[]>, p: Record<string, unknown>): Record<string, unknown>[] {
  const complete = new Set(scopedResponses(tables, p).filter((r) => r.Status === 'Complete').map((r) => fold(r.ID)));
  const vals: { question: string; response: string; kind: string; value: string; numeric: number | null }[] = [];
  for (const a of tables[ANSWERS].filter((row) => complete.has(fold(row.ResponseID)))) {
    const push = (kind: string, value: string, numeric: number | null = null): void => {
      vals.push({ question: String(a.QuestionID), response: fold(a.ResponseID), kind, value, numeric });
    };
    const array = jsonArray(a.JSONValue);
    if (array) {
      // OPENJSON element: [type] 0 is JSON null; the value is trimmed and must not be blank.
      for (const element of array) {
        if (element === null) continue;
        const text = (typeof element === 'object' ? JSON.stringify(element) : String(element)).trim();
        if (text !== '') push('Text', text);
      }
    } else if (typeof a.TextValue === 'string' && a.TextValue.trim() !== '') {
      push('Text', a.TextValue);
    }
    if (typeof a.NumericValue === 'number') push('Numeric', a.NumericValue.toFixed(4), a.NumericValue);
    if (typeof a.BooleanValue === 'boolean') push('Boolean', a.BooleanValue ? 'true' : 'false');
    const date = instant(a.DateValue);
    if (date) push('Date', date.toISOString());
  }
  const answered = new Map<string, Set<string>>();
  const counted = new Map<string, { question: string; kind: string; value: string; numeric: number | null; count: number }>();
  for (const v of vals) {
    const responses = answered.get(fold(v.question)) ?? new Set<string>();
    responses.add(v.response);
    answered.set(fold(v.question), responses);
    // Exact text, as the SQL groups on the value's bytes: 'g', 'G' and 'g ' are three values.
    const key = `${fold(v.question)}|${v.kind}|${v.value}`;
    const entry = counted.get(key);
    if (entry) entry.count += 1;
    else counted.set(key, { question: v.question, kind: v.kind, value: v.value, numeric: v.numeric, count: 1 });
  }
  return [...counted.values()].map((c) => ({
    QuestionID: c.question.toUpperCase(),
    AnsweredResponses: answered.get(fold(c.question))?.size ?? 0,
    ValueKind: c.kind,
    Value: c.value,
    NumericValue: c.numeric,
    ValueCount: c.count,
  }));
}

/** `Forms: Page Funnel Reach`: pages from the labelling snapshot, reach over every status. */
function funnelReach(tables: Record<string, FakeRow[]>, p: Record<string, unknown>): Record<string, unknown>[] {
  const version = tables[VERSIONS]
    .filter((v) => fold(v.FormID) === fold(p.FormID) && (p.FormVersionID ? fold(v.ID) === fold(p.FormVersionID) : v.Status === 'Published'))
    .sort((a, b) => Number(b.VersionNumber) - Number(a.VersionNumber))[0];
  if (!version || typeof version.DefinitionSnapshot !== 'string') return [];
  const definition = JSON.parse(version.DefinitionSnapshot) as PublishedFormDefinition;
  const scoped = new Set(scopedResponses(tables, p).map((r) => fold(r.ID)));
  return [...definition.pages]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
    .map((page) => {
      const ids = new Set(page.questions.map((q) => fold(q.id)));
      const reached = new Set(tables[ANSWERS].filter((a) => ids.has(fold(a.QuestionID)) && scoped.has(fold(a.ResponseID))).map((a) => fold(a.ResponseID)));
      return {
        PageID: page.id,
        Title: page.title ?? null,
        DisplayOrder: page.displayOrder,
        ReachedCount: reached.size,
        QuestionTypes: page.questions.length ? page.questions.map((q) => q.type).join(',') : null,
      };
    });
}
