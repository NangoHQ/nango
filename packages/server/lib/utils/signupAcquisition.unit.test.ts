import { describe, expect, it } from 'vitest';

import { signupAcquisitionSchema } from './signupAcquisition.js';

describe('signup acquisition validation', () => {
    it('strips unexpected fields', () => {
        expect(signupAcquisitionSchema.parse({ acquisition_utm_source: ' facebook ', unexpected: 'private' })).toEqual({ acquisition_utm_source: 'facebook' });
    });

    it.each([
        null,
        { acquisition_utm_source: 42 },
        { acquisition_utm_source: 'x'.repeat(257) },
        { acquisition_utm_source: 'person@example.com' },
        { acquisition_landing_path: '/signup?token=secret' },
        { acquisition_referring_domain: 'https://facebook.com/private' }
    ])('drops malformed analytics without rejecting signup: %j', (input) => {
        expect(signupAcquisitionSchema.parse(input)).toBeUndefined();
    });
});
