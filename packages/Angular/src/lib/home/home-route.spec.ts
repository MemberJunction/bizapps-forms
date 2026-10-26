import { describe, expect, it } from 'vitest';
import { isFormsHomeUrl } from './home-route';

describe('isFormsHomeUrl', () => {
  it.each([
    '/app/forms',
    '/app/forms/',
    '/app/Forms/Forms',
    '/app/forms/forms?x=1#top',
    '/app/forms/dashboard/3F8A6B12-9C4D-4E7A-B1F2-5A6D7E8C9012',
    '/explorer/app/forms/Forms',
  ])('treats %s as the Forms home', (url) => {
    expect(isFormsHomeUrl(url)).toBe(true);
  });

  it.each([
    '/app/forms/Responses%20%26%20Analytics',
    '/app/forms/record/MJ_BizApps_Forms%3A%20Forms/abc',
    '/app/forms/dashboard/EB23CCFD-AAF5-48BE-8B81-33A3944AD898',
    '/app/home',
    '/app/formsx',
    '/app/forms/%E0%A4%A',
    '/',
    '',
  ])('does not treat %s as the Forms home', (url) => {
    expect(isFormsHomeUrl(url)).toBe(false);
  });
});
