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
        { acquisition_referring_domain: 'https://facebook.com/private' },
        { acquisition_referring_domain: '..' },
        { acquisition_referring_domain: 'a..b' },
        { acquisition_referring_domain: '-facebook.com' },
        { acquisition_referring_domain: 'facebook-.com' },
        { acquisition_referring_domain: `${'x'.repeat(64)}.com` }
    ])('drops malformed analytics without rejecting signup: %j', (input) => {
        expect(signupAcquisitionSchema.parse(input)).toBeUndefined();
    });

    it('keeps valid fields when one field is invalid', () => {
        expect(
            signupAcquisitionSchema.parse({
                acquisition_utm_source: 'facebook',
                acquisition_utm_campaign: 'launch',
                acquisition_referring_domain: 'my_blog.example.com',
                acquisition_landing_path: '/signup?token=secret'
            })
        ).toEqual({ acquisition_utm_source: 'facebook', acquisition_utm_campaign: 'launch' });
    });

    it('keeps a valid referrer and landing page when campaign data is malformed', () => {
        expect(
            signupAcquisitionSchema.parse({
                acquisition_utm_source: 42,
                acquisition_utm_medium: 'paid_social',
                acquisition_referring_domain: 'github.com',
                acquisition_landing_path: '/signup'
            })
        ).toEqual({ acquisition_utm_medium: 'paid_social', acquisition_referring_domain: 'github.com', acquisition_landing_path: '/signup' });
    });

    it.each(['facebook.com', 'www.google.com', 'xn--bcher-kva.example', 'sub-domain.example'])('accepts valid domain labels: %s', (domain) => {
        expect(signupAcquisitionSchema.parse({ acquisition_referring_domain: domain })).toEqual({ acquisition_referring_domain: domain });
    });
});
