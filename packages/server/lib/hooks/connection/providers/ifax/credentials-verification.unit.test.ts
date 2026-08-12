import { describe, expect, it } from 'vitest';

import { hasInvalidAccessToken } from './credentials-verification.js';

describe('hasInvalidAccessToken', () => {
    it('detects the invalid credential response returned by iFax', () => {
        expect(hasInvalidAccessToken({ status: 0, code: 12001, message: 'accessToken invalid' })).toBe(true);
        expect(hasInvalidAccessToken({ code: 12001 })).toBe(true);
    });

    it('accepts other iFax responses, including account plan errors', () => {
        expect(hasInvalidAccessToken({ status: 0, code: 12004, message: "Professional plan isn't activated" })).toBe(false);
        expect(hasInvalidAccessToken({ status: 1, message: 'Success' })).toBe(false);
    });

    it('does not treat malformed responses as invalid credentials', () => {
        expect(hasInvalidAccessToken(null)).toBe(false);
        expect(hasInvalidAccessToken({})).toBe(false);
    });
});
