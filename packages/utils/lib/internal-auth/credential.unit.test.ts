import { describe, expect, it } from 'vitest';

import { getInternalAuthBearerHeader, getInternalServiceCredential, isInternalAuthRequired } from './credential.js';

describe('getInternalServiceCredential', () => {
    it('returns null when nothing is set', () => {
        expect(getInternalServiceCredential({})).toBeNull();
    });

    it('reads NANGO_INTERNAL_AUTH_TOKEN', () => {
        expect(getInternalServiceCredential({ NANGO_INTERNAL_AUTH_TOKEN: ' secret ' })).toBe('secret');
    });
});

describe('isInternalAuthRequired', () => {
    it('defaults to false', () => {
        expect(isInternalAuthRequired({})).toBe(false);
        expect(isInternalAuthRequired({ NANGO_INTERNAL_AUTH_REQUIRED: 'false' })).toBe(false);
    });

    it('is true only for the string true', () => {
        expect(isInternalAuthRequired({ NANGO_INTERNAL_AUTH_REQUIRED: 'true' })).toBe(true);
        expect(isInternalAuthRequired({ NANGO_INTERNAL_AUTH_REQUIRED: 'TRUE' })).toBe(true);
    });
});

describe('getInternalAuthBearerHeader', () => {
    it('omits the header when there is no token', () => {
        expect(getInternalAuthBearerHeader(null)).toEqual({});
        expect(getInternalAuthBearerHeader(undefined)).toEqual({});
        expect(getInternalAuthBearerHeader('')).toEqual({});
    });

    it('sets Authorization when a token is present', () => {
        expect(getInternalAuthBearerHeader('abc')).toEqual({ Authorization: 'Bearer abc' });
    });
});
