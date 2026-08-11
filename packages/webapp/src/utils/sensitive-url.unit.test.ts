import { describe, expect, it } from 'vitest';

import { redactSensitiveProperties, redactSensitiveText } from './sensitive-url.js';

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoibWF0ZWpAbmFuZ28uZGV2IiwiaWF0IjoxNzAwMDAwMDAwfQ.abc123DEF-_456';

describe('redactSensitiveText', () => {
    it('redacts the reset password token from a full url', () => {
        expect(redactSensitiveText(`https://app.nango.dev/reset-password/${JWT}`)).toBe('https://app.nango.dev/reset-password/[redacted]');
    });

    it('redacts the reset password token from a bare pathname', () => {
        expect(redactSensitiveText(`/reset-password/${JWT}`)).toBe('/reset-password/[redacted]');
    });

    it('keeps the query string and hash', () => {
        expect(redactSensitiveText(`https://app.nango.dev/reset-password/${JWT}?foo=bar#top`)).toBe(
            'https://app.nango.dev/reset-password/[redacted]?foo=bar#top'
        );
    });

    it('redacts every token-bearing route', () => {
        expect(redactSensitiveText('/signup/invite-token')).toBe('/signup/[redacted]');
        expect(redactSensitiveText('/signup/verification/verify-token')).toBe('/signup/verification/[redacted]');
        expect(redactSensitiveText('/verify-email/expired/expired-token')).toBe('/verify-email/expired/[redacted]');
        expect(redactSensitiveText('/verify-email/8f14e45f-ceea-467a-9b0d-1e0a1b2c3d4e')).toBe('/verify-email/[redacted]');
    });

    it('does not let the broader rules swallow the more specific routes', () => {
        expect(redactSensitiveText('/signup/verification/tok')).not.toContain('/signup/[redacted]');
        expect(redactSensitiveText('/verify-email/expired/tok')).not.toContain('/verify-email/[redacted]/');
    });

    it('leaves token-free auth routes alone', () => {
        expect(redactSensitiveText('/signup')).toBe('/signup');
        expect(redactSensitiveText('/forgot-password')).toBe('/forgot-password');
        expect(redactSensitiveText('/signup/verification')).toBe('/signup/verification');
    });

    it('redacts the invite token from the ?next= param', () => {
        expect(redactSensitiveText('/signin?next=/signup/invite-token')).toBe('/signin?next=/signup/[redacted]');
        expect(redactSensitiveText('/signin?next=%2Fsignup%2Finvite-token')).toBe('/signin?next=%2Fsignup%2F[redacted]');
    });

    it('redacts a jwt anywhere, whatever the surrounding shape', () => {
        expect(redactSensitiveText(`a:link:href="/x/${JWT}";div:nth-child="1"`)).toBe('a:link:href="/x/[redacted]";div:nth-child="1"');
    });

    it('is idempotent', () => {
        const once = redactSensitiveText(`/reset-password/${JWT}`);

        expect(redactSensitiveText(once)).toBe(once);
    });

    it('returns unrelated strings untouched', () => {
        expect(redactSensitiveText('')).toBe('');
        expect(redactSensitiveText('https://app.nango.dev/integrations/github')).toBe('https://app.nango.dev/integrations/github');
    });
});

describe('redactSensitiveProperties', () => {
    it('redacts url properties and autocapture element hrefs', () => {
        const properties: Record<string, unknown> = {
            $current_url: `https://app.nango.dev/reset-password/${JWT}`,
            $pathname: `/reset-password/${JWT}`,
            $referrer: '/signin?next=/signup/invite-token',
            $elements_chain: `a:href="/reset-password/${JWT}"`,
            $elements: [{ tag_name: 'a', attr__href: `/reset-password/${JWT}` }],
            $screen_height: 1080
        };

        redactSensitiveProperties(properties);

        expect(properties).toStrictEqual({
            $current_url: 'https://app.nango.dev/reset-password/[redacted]',
            $pathname: '/reset-password/[redacted]',
            $referrer: '/signin?next=/signup/[redacted]',
            $elements_chain: 'a:href="/reset-password/[redacted]"',
            $elements: [{ tag_name: 'a', attr__href: '/reset-password/[redacted]' }],
            $screen_height: 1080
        });
    });

    it('does not walk arrays other than $elements', () => {
        const snapshotData = [{ data: { href: `/reset-password/${JWT}` } }];
        const properties: Record<string, unknown> = { $snapshot_data: snapshotData };

        redactSensitiveProperties(properties);

        expect(properties.$snapshot_data).toStrictEqual(snapshotData);
    });
});
