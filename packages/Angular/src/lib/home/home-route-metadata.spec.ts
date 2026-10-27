/**
 * `home-route.ts` hardcodes the Forms home's nav label and dashboard id so the URL test needs no
 * metadata at runtime. This pins those copies to the metadata that ships them: change either side
 * alone and the Explorer return-to-home refresh (F10) silently stops matching.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isFormsHomeUrl } from './home-route';

interface NavItem {
  Label: string;
  ResourceType: string;
  RecordID: string;
  isDefault?: boolean;
}
interface AppRecord {
  fields: { Name: string; DefaultNavItems: NavItem[] };
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

describe('home-route against the shipped application metadata', () => {
  const raw = JSON.parse(readFileSync(resolve(repoRoot, 'metadata/applications/.applications.json'), 'utf8')) as AppRecord[] | AppRecord;
  const app = (Array.isArray(raw) ? raw : [raw]).find((a) => a.fields.Name === 'Forms');

  it('matches the default Forms nav item by label and by dashboard id', () => {
    const home = app?.fields.DefaultNavItems.find((n) => n.ResourceType === 'Dashboards' && n.isDefault && n.Label === 'Forms');
    expect(home, 'the Forms app has no default "Forms" dashboard nav item').toBeDefined();
    expect(isFormsHomeUrl(`/app/forms/${home?.Label}`)).toBe(true);
    expect(isFormsHomeUrl(`/app/forms/dashboard/${home?.RecordID}`)).toBe(true);
  });

  it('does not match the sibling dashboard nav item', () => {
    const others = app?.fields.DefaultNavItems.filter((n) => n.Label !== 'Forms') ?? [];
    expect(others.length).toBeGreaterThan(0);
    for (const n of others) {
      expect(isFormsHomeUrl(`/app/forms/${encodeURIComponent(n.Label)}`)).toBe(false);
      expect(isFormsHomeUrl(`/app/forms/dashboard/${n.RecordID}`)).toBe(false);
    }
  });
});
