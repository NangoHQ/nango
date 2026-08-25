import { describe, expect, it } from 'vitest';

import { resolveDashboardApiUrl } from './resolveDashboardApiUrl.js';

const ORIGIN = 'https://nango.internal.example.com';
const API_URL = 'https://nango.example.com';
const DASHBOARD_API_URL = 'https://nango.dashboard-api.example.com';

describe('resolveDashboardApiUrl', () => {
    it('resolves `/` to the page origin', () => {
        expect(resolveDashboardApiUrl('/', ORIGIN, API_URL)).toBe(ORIGIN);
    });

    it('falls back to apiUrl when the value is missing', () => {
        expect(resolveDashboardApiUrl(undefined, ORIGIN, API_URL)).toBe(API_URL);
        expect(resolveDashboardApiUrl('', ORIGIN, API_URL)).toBe(API_URL);
    });

    it('returns an absolute URL unchanged', () => {
        expect(resolveDashboardApiUrl(DASHBOARD_API_URL, ORIGIN, API_URL)).toBe(DASHBOARD_API_URL);
    });
});
