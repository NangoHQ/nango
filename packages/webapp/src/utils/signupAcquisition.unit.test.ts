import { beforeEach, describe, expect, it, vi } from 'vitest';

import { acquisitionFromInitialInfo, readSignupAcquisition } from './signupAcquisition';

const sdk = vi.hoisted(() => ({ has_opted_out_capturing: vi.fn(), get_property: vi.fn() }));
vi.mock('posthog-js', () => ({ default: sdk }));

describe('signup acquisition', () => {
    beforeEach(() => vi.resetAllMocks());

    it('keeps campaign fields and strips unrelated URL data', () => {
        expect(
            acquisitionFromInitialInfo({
                u: 'https://nango.dev/integrations?utm_source=facebook&utm_medium=paid_social&utm_campaign=launch&token=secret#fragment',
                r: 'https://www.facebook.com/feed?private=value'
            })
        ).toEqual({
            acquisition_utm_source: 'facebook',
            acquisition_utm_medium: 'paid_social',
            acquisition_utm_campaign: 'launch',
            acquisition_landing_path: '/integrations',
            acquisition_referring_domain: 'www.facebook.com'
        });
    });

    it.each([undefined, {}, { u: 'invalid' }, { u: 'https://app.nango.dev/signup' }, { u: 'https://other.example/' }])(
        'ignores unavailable website history: %j',
        (info) => {
            expect(acquisitionFromInitialInfo(info)).toBeUndefined();
        }
    );

    it('does not invent a referrer for direct visits or use unsafe campaign values', () => {
        expect(acquisitionFromInitialInfo({ u: 'https://nango.dev/?utm_source=person@example.com&utm_term=' + 'x'.repeat(257), r: '$direct' })).toEqual({
            acquisition_landing_path: '/'
        });
    });

    it('honors opt-out and tolerates an unavailable SDK', () => {
        sdk.has_opted_out_capturing.mockReturnValue(true);
        expect(readSignupAcquisition()).toBeUndefined();
        expect(sdk.get_property).not.toHaveBeenCalled();
        sdk.has_opted_out_capturing.mockReturnValue(false);
        sdk.get_property.mockImplementation(() => {
            throw new Error('unavailable');
        });
        expect(readSignupAcquisition()).toBeUndefined();
    });
});
