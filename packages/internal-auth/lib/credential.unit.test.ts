import { describe, expect, it } from 'vitest';

import { getInternalAuthBearerHeader } from './credential.js';

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
