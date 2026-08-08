import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { LoadFormsActions } from './register';

// Force the @RegisterClass decorators to run.
LoadFormsActions();

/** The seam-S3 names are a hard contract — WP-B invokes these by name. */
const S3_ACTION_NAMES = [
  'Forms: Upsert Respondent Person',
  'Forms: Send Confirmation Email',
  'Forms: Create Followup Task',
  'Forms: Analyze Written Responses',
] as const;

const AUTHORING_ACTION_NAMES = [
  'Forms: Generate Form From Brief',
  'Forms: Create Form From Template',
  'Forms: Bind Response To Entity',
] as const;

describe('action registration', () => {
  it('LoadFormsActions reports all seven action classes', () => {
    expect(LoadFormsActions()).toBe(7);
  });

  it.each([...S3_ACTION_NAMES, ...AUTHORING_ACTION_NAMES])(
    'resolves "%s" from the class factory by exact name',
    (name) => {
      const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(BaseAction, name);
      expect(instance).toBeInstanceOf(BaseAction);
    },
  );
});
