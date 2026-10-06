import { describe, expect, it } from 'vitest';

import { assessStoragePins, type StorageAccountSummary, type StoragePin } from '../storage-readiness';

const A: StorageAccountSummary = {
  id: '0CD8473E-F36B-1410-8D16-00822C986318',
  name: 'Account A',
  providerName: 'Box',
  providerActive: true,
};
const B: StorageAccountSummary = {
  id: 'B2900000-0000-4000-8000-0000000000AB',
  name: 'Account B',
  providerName: 'Local Disk Storage',
  providerActive: true,
};
/** An account whose PROVIDER is switched off: MJ's upload resolution and read listing ignore that flag. */
const C: StorageAccountSummary = {
  id: 'C0000000-0000-4000-8000-0000000000CC',
  name: 'Account C',
  providerName: 'Old Box',
  providerActive: false,
};

const pins = (asset?: string, upload?: string, download?: string): StoragePin[] => [
  { envVar: 'FORMS_ASSET_STORAGE_ACCOUNT', value: asset, role: 'write' },
  { envVar: 'FORMS_UPLOAD_STORAGE_ACCOUNT', value: upload, role: 'write' },
  { envVar: 'FORMS_DOWNLOAD_STORAGE_ACCOUNT', value: download, role: 'read' },
];

describe('assessStoragePins', () => {
  it('reports nothing when the write pins name real accounts', () => {
    expect(assessStoragePins([A, B], pins(A.id, B.id))).toEqual({ warnings: [], errors: [] });
  });

  it('matches a lower-case pin against an upper-case account id', () => {
    expect(assessStoragePins([A, B], pins(A.id.toLowerCase(), B.id.toLowerCase()))).toEqual({ warnings: [], errors: [] });
  });

  it('errors when a pin names no active account, listing the active ones', () => {
    const { errors } = assessStoragePins([A, B], pins('DEADBEEF-0000-4000-8000-000000000000', B.id));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('FORMS_ASSET_STORAGE_ACCOUNT is set to DEADBEEF-0000-4000-8000-000000000000');
    expect(errors[0]).toContain('which names no File Storage Account here; uploads through it fail and reads skip it.');
    expect(errors[0]).toContain(`"Account A" (${A.id}, Box)`);
    expect(errors[0]).toContain(`"Account B" (${B.id}, Local Disk Storage)`);
  });

  it('errors on an unknown download pin too', () => {
    const { errors } = assessStoragePins([A, B], pins(A.id, B.id, 'nope'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('FORMS_DOWNLOAD_STORAGE_ACCOUNT is set to nope');
    expect(errors[0]).toContain('reads skip it');
    expect(errors[0]).not.toContain('uploads through it fail');
  });

  it('warns once, naming every account and every unset write pin, when several accounts exist', () => {
    const { warnings, errors } = assessStoragePins([A, B], pins());
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`"Account A" (${A.id}, Box)`);
    expect(warnings[0]).toContain(`"Account B" (${B.id}, Local Disk Storage)`);
    expect(warnings[0]).toContain('FORMS_ASSET_STORAGE_ACCOUNT');
    expect(warnings[0]).toContain('FORMS_UPLOAD_STORAGE_ACCOUNT');
    expect(warnings[0]).toContain('whichever account the engine resolves first');
    expect(warnings[0]).toContain('every host sharing the database should pin the same account');
  });

  it('names only the unset write pin when the other is set', () => {
    const { warnings } = assessStoragePins([A, B], pins(A.id));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('FORMS_UPLOAD_STORAGE_ACCOUNT');
    expect(warnings[0]).not.toContain('FORMS_ASSET_STORAGE_ACCOUNT');
  });

  it('never warns about an unset download pin', () => {
    expect(assessStoragePins([A, B], pins(A.id, B.id)).warnings).toEqual([]);
  });

  it('does not warn with zero or one account', () => {
    expect(assessStoragePins([], pins()).warnings).toEqual([]);
    expect(assessStoragePins([A], pins()).warnings).toEqual([]);
  });

  it('errors distinctly when a write pin names an account on an INACTIVE provider, because Forms still uses it', () => {
    const { errors } = assessStoragePins([A, B, C], pins(C.id.toLowerCase(), B.id));
    expect(errors).toEqual([
      `FORMS_ASSET_STORAGE_ACCOUNT is set to ${C.id.toLowerCase()}, which names "Account C" on provider "Old Box", ` +
        'which is inactive; Forms still writes to and reads from it, but MJ treats the provider as switched off — ' +
        'reactivate the provider or repin.',
    ]);
  });

  it('says only "reads from" for a download pin on an inactive provider, since that pin never takes uploads', () => {
    const { errors } = assessStoragePins([A, B, C], pins(A.id, B.id, C.id));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('FORMS_DOWNLOAD_STORAGE_ACCOUNT is set to');
    expect(errors[0]).toContain('which is inactive; Forms still reads from it, but MJ treats the provider as switched off');
    expect(errors[0]).not.toContain('writes to');
  });

  it('lists only active accounts when a pin names no account at all', () => {
    const { errors } = assessStoragePins([A, C], pins('nope', A.id));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('FORMS_ASSET_STORAGE_ACCOUNT is set to nope');
    expect(errors[0]).not.toContain('Account C');
  });

  it('counts only active accounts toward the several-accounts warning', () => {
    expect(assessStoragePins([A, C], pins()).warnings).toEqual([]);
    const { warnings } = assessStoragePins([A, B, C], pins());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^2 File Storage Accounts exist/);
    expect(warnings[0]).not.toContain('Account C');
  });

  it('treats an empty-string pin as unset', () => {
    expect(assessStoragePins([A, B], pins('', B.id)).warnings).toHaveLength(1);
  });
});
