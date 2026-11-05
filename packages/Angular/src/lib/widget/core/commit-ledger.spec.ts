import { describe, expect, it } from 'vitest';
import type { FormsSaveResponseOutput } from '@mj-biz-apps/forms-entities';
import { CommitLedger } from './commit-ledger';

const verdict = (outcome: string): FormsSaveResponseOutput => ({ Outcome: outcome }) as unknown as FormsSaveResponseOutput;

describe('CommitLedger', () => {
  it('before any acknowledge, JudgedAnswers() is the loaded key', () => {
    const ledger = new CommitLedger();
    expect(ledger.JudgedAnswers()).toBeUndefined();
    ledger.Reset('L');
    expect(ledger.JudgedAnswers()).toBe('L');
  });

  it('after Acknowledge, JudgedAnswers() is the acknowledged key', () => {
    const ledger = new CommitLedger();
    ledger.Reset('L');
    ledger.Acknowledge('A', verdict('ok'));
    expect(ledger.JudgedAnswers()).toBe('A');
  });

  it('VerdictFor returns the result only for the acknowledged key', () => {
    const ledger = new CommitLedger();
    expect(ledger.VerdictFor('A')).toBeUndefined();
    const result = verdict('ended');
    ledger.Acknowledge('A', result);
    expect(ledger.VerdictFor('A')).toBe(result);
    expect(ledger.VerdictFor('B')).toBeUndefined();
  });

  it('HasUnjudgedCommit() is true after a Commit of a new key and false after that key is acknowledged', () => {
    const ledger = new CommitLedger();
    expect(ledger.HasUnjudgedCommit()).toBe(false);
    ledger.Commit('C');
    expect(ledger.HasUnjudgedCommit()).toBe(true);
    ledger.Acknowledge('C', verdict('ok'));
    expect(ledger.HasUnjudgedCommit()).toBe(false);
  });

  it('HasUnjudgedCommit() is false after Commit(undefined)', () => {
    const ledger = new CommitLedger();
    ledger.Commit('C');
    ledger.Commit(undefined);
    expect(ledger.HasUnjudgedCommit()).toBe(false);
  });

  it('IsCommitted is true only for the committed key', () => {
    const ledger = new CommitLedger();
    expect(ledger.IsCommitted('C')).toBe(false);
    ledger.Commit('C');
    expect(ledger.IsCommitted('C')).toBe(true);
    expect(ledger.IsCommitted('D')).toBe(false);
    ledger.Commit(undefined);
    expect(ledger.IsCommitted('C')).toBe(false);
  });

  it('Reset clears all three', () => {
    const ledger = new CommitLedger();
    ledger.Reset('L');
    ledger.Commit('C');
    ledger.Acknowledge('A', verdict('ok'));
    ledger.Reset('N');
    expect(ledger.JudgedAnswers()).toBe('N');
    expect(ledger.VerdictFor('A')).toBeUndefined();
    expect(ledger.HasUnjudgedCommit()).toBe(false);
    expect(ledger.IsCommitted('C')).toBe(false);
    ledger.Reset(undefined);
    expect(ledger.JudgedAnswers()).toBeUndefined();
  });
});
