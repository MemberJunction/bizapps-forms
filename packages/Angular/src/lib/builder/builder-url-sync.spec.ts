import { describe, expect, it, vi } from 'vitest';
import { BuilderUrlSync, type BuilderUrlPorts } from './builder-url-sync';
import { DEFAULT_RESPONSE_QUERY } from '../responses/responses-query';

const FORM = 'A11C0DE0-0000-4000-8000-000000000003';
const RECORD_PATH = `/app/forms/record/MJ_BizApps_Forms%3A%20Forms/ID%7C${FORM}`;

function ports(path: string) {
  let url = path;
  const listeners = new Set<(url: string) => void>();
  const writes: Record<string, string | null>[] = [];
  const p: BuilderUrlPorts = {
    path: () => url,
    onUrlChange: (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    writeActiveTab: vi.fn((params) => void writes.push(params)),
  };
  const navigate = (next: string) => {
    url = next;
    listeners.forEach((fn) => fn(next));
  };
  return { p, writes, navigate, live: () => listeners.size };
}

describe('BuilderUrlSync', () => {
  it('reads the view the address bar names for this form', () => {
    const { p } = ports(`${RECORD_PATH}?view=responses&q=ann`);
    expect(new BuilderUrlSync(FORM, p).Read()).toEqual({
      view: 'responses',
      responses: { query: { ...DEFAULT_RESPONSE_QUERY, search: 'ann' }, responseId: null },
    });
  });

  it('reads nothing while the address bar is another tab\'s', () => {
    const { p } = ports('/app/forms/Forms?q=intake');
    expect(new BuilderUrlSync(FORM, p).Read()).toBeNull();
  });

  it('writes only while the address bar is this form\'s — so never into another tab', () => {
    const { p, writes, navigate } = ports(RECORD_PATH);
    const sync = new BuilderUrlSync(FORM, p);
    sync.Write({ view: 'design', responses: { query: DEFAULT_RESPONSE_QUERY, responseId: null } });
    navigate('/app/forms/Forms');
    sync.Write({ view: 'automate', responses: { query: DEFAULT_RESPONSE_QUERY, responseId: null } });

    expect(writes).toEqual([{ view: 'design', q: null, sort: null, page: null, size: null, response: null }]);
  });

  it('follows back / forward on this form, and ignores its own writes coming back', () => {
    const { p, navigate } = ports(RECORD_PATH);
    const sync = new BuilderUrlSync(FORM, p);
    const applied = vi.fn();
    sync.Watch(applied);

    sync.Write({ view: 'design', responses: { query: DEFAULT_RESPONSE_QUERY, responseId: null } });
    navigate(`${RECORD_PATH}?view=design`);
    expect(applied).not.toHaveBeenCalled();

    navigate(RECORD_PATH);
    expect(applied).toHaveBeenCalledWith({ view: 'build', responses: { query: DEFAULT_RESPONSE_QUERY, responseId: null } });

    navigate('/app/forms/Forms?q=x');
    expect(applied).toHaveBeenCalledTimes(1);
  });

  it('stops listening when stopped', () => {
    const { p, live } = ports(RECORD_PATH);
    const sync = new BuilderUrlSync(FORM, p);
    sync.Watch(() => undefined);
    expect(live()).toBe(1);
    sync.Stop();
    expect(live()).toBe(0);
  });
});
