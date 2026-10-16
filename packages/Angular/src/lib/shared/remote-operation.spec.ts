/**
 * `runOperation` — the one way this package runs a Forms Remote Operation — folds the three ways a
 * result can be unusable into one outcome, and announces a successful write to the other surfaces.
 * Run through a REAL generated operation class; only the provider it routes through is faked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormsArchiveFormOperation } from '@mj-biz-apps/forms-entities';
import { installFakeOperations, refused, succeeded, type FakeOperations } from './testing/fake-operations';

const logged: string[] = [];
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: (message: string) => logged.push(message) };
});

const { runOperation } = await import('./remote-operation');
const { onFormsWrite } = await import('./forms-writes');

let operations: FakeOperations | null = null;
afterEach(() => {
  operations?.restore();
  operations = null;
  logged.length = 0;
});

const archive = () => runOperation(new FormsArchiveFormOperation(), { FormID: 'f1' }, 'archiving form f1', ['MJ_BizApps_Forms: Forms']);

describe('runOperation', () => {
  it('routes the generated operation by its key, with the input as given', async () => {
    operations = installFakeOperations(() => succeeded({ FormID: 'f1', Status: 'Closed' }));

    const outcome = await archive();

    expect(operations.calls).toEqual([{ key: 'Forms.ArchiveForm', input: { FormID: 'f1' } }]);
    expect(outcome).toEqual({ ok: true, output: { FormID: 'f1', Status: 'Closed' } });
  });

  it("returns the server's refusal as the author-facing error, and logs what was being done", async () => {
    operations = installFakeOperations(() => refused('Form f1 does not exist.', 'EXECUTION_ERROR'));

    const outcome = await archive();

    expect(outcome).toEqual({ ok: false, error: 'Form f1 does not exist.', resultCode: 'EXECUTION_ERROR' });
    expect(logged.join('\n')).toContain('archiving form f1 (Forms.ArchiveForm) failed [EXECUTION_ERROR]');
  });

  it('never returns an empty error, even when the refusal carries no reason', async () => {
    operations = installFakeOperations(() => ({ Success: false, ResultCode: 'FORBIDDEN' }));

    const outcome = await archive();

    expect(outcome).toMatchObject({ ok: false, resultCode: 'FORBIDDEN' });
    expect(!outcome.ok && outcome.error.length).toBeGreaterThan(0);
  });

  it('treats a "success" with no output as a failure, rather than handing back undefined', async () => {
    operations = installFakeOperations(() => ({ Success: true, ResultCode: 'SUCCESS' }));

    const outcome = await archive();

    expect(outcome.ok).toBe(false);
  });

  it('reports a request that never reached the server', async () => {
    operations = installFakeOperations(() => Promise.reject(new Error('Failed to fetch')));

    const outcome = await archive();

    expect(outcome).toEqual({ ok: false, error: 'The server could not be reached (Failed to fetch).', resultCode: null });
  });

  it('announces the entities a successful operation wrote — and nothing for a refusal', async () => {
    const heard: string[] = [];
    const subscription = onFormsWrite('MJ_BizApps_Forms: Forms', ['save'], () => heard.push('form written'));
    try {
      operations = installFakeOperations(() => refused('no'));
      await archive();
      expect(heard).toEqual([]);

      operations.restore();
      operations = installFakeOperations(() => succeeded({ FormID: 'f1', Status: 'Closed' }));
      await archive();
      expect(heard).toEqual(['form written']);
    } finally {
      subscription.unsubscribe();
    }
  });
});
