/**
 * The EXEC text the SQL Server branches send for Forms' guarded-write procedures (#338). A parameter
 * that cannot be rendered safely must throw before any SQL exists, never reach the database.
 */
import { describe, expect, it } from 'vitest';
import type { DatabaseProviderBase } from '@memberjunction/core';

import { makeFakeProvider } from '../../testing/index.js';
import { FORMS_ENTITY } from '../entity-names.js';
import { formsProcedureCall, procedureCallInSchema } from '../forms-procedure.js';

const { provider } = makeFakeProvider({});

describe('formsProcedureCall', () => {
  it("EXECs the procedure in the entity's schema, parameters in order: strings quoted, integers bare, null as NULL", () => {
    expect(
      formsProcedureCall(provider, FORMS_ENTITY.FormAutomationEvent, 'spFormAutomationEventSettle', {
        ID: 'event-1',
        WorkerID: "it's me",
        RetryAfterSeconds: 8,
        LastError: null,
      }),
    ).toBe(
      "EXEC [__mj_BizAppsForms].[spFormAutomationEventSettle] @ID = 'event-1', @WorkerID = 'it''s me', @RetryAfterSeconds = 8, @LastError = NULL",
    );
  });

  it('a procedure with no parameters ends at its name', () => {
    expect(formsProcedureCall(provider, FORMS_ENTITY.Form, 'spNothing', {})).toBe('EXEC [__mj_BizAppsForms].[spNothing]');
  });

  it('throws naming the entity and the procedure when the entity is not in metadata', () => {
    const empty = { ...provider, EntityByName: () => undefined } as unknown as DatabaseProviderBase;
    expect(() => formsProcedureCall(empty, FORMS_ENTITY.Form, 'spFormLockRowForQuota', { ID: 'form-1' })).toThrow(
      /MJ_BizApps_Forms: Forms[\s\S]*spFormLockRowForQuota/,
    );
  });

  it.each([
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('throws naming the parameter when a number is %s', (_label, value) => {
    expect(() => formsProcedureCall(provider, FORMS_ENTITY.Form, 'spX', { BatchSize: value })).toThrow(/BatchSize/);
  });

  it.each(['', '1ID', 'ID; DROP TABLE x', 'ID ', '@ID'])('throws when a parameter name is not a plain identifier (%j)', (name) => {
    expect(() => formsProcedureCall(provider, FORMS_ENTITY.Form, 'spX', { [name]: 'v' })).toThrow(/parameter name/);
  });
});

describe('procedureCallInSchema', () => {
  it('EXECs in the schema given, for a caller that already holds its EntityInfo', () => {
    expect(procedureCallInSchema(provider, '__mj_BizAppsForms', 'spFormResponseLockRow', { ID: "o'brien" })).toBe(
      "EXEC [__mj_BizAppsForms].[spFormResponseLockRow] @ID = 'o''brien'",
    );
  });
});
