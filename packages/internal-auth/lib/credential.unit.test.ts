import { describe, expect, it } from 'vitest';

import { getInternalAuthBearerHeaderIfPresent } from './credential.js';

describe('getInternalAuthBearerHeaderIfPresent', () => {
    it('omits the header when there is no token', () => {
        expect(getInternalAuthBearerHeaderIfPresent(null)).toEqual({});
        expect(getInternalAuthBearerHeaderIfPresent(undefined)).toEqual({});
        expect(getInternalAuthBearerHeaderIfPresent('')).toEqual({});
    });

    it('sets Authorization when a token is present', () => {
        expect(getInternalAuthBearerHeaderIfPresent('abc')).toEqual({ Authorization: 'Bearer abc' });
    });
});
