import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { redactSensitiveProperties, redactSensitiveText } from './sensitive-url.js';

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoibWF0ZWpAbmFuZ28uZGV2IiwiaWF0IjoxNzAwMDAwMDAwfQ.abc123DEF-_456';
const UUID = '8f14e45f-ceea-467a-9b0d-1e0a1b2c3d4e';

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
        expect(redactSensitiveText(`/verify-email/${UUID}`)).toBe('/verify-email/[redacted]');
    });

    // Guards the pattern list against new token routes added to the router.
    it('covers every token-bearing route in the router', () => {
        const routerSource = readFileSync(new URL('../app/router.tsx', import.meta.url), 'utf8');
        const tokenRoutes = [...routerSource.matchAll(/path: '([^']*\/:(?:token|uuid))'/g)].map((match) => match[1]);

        expect(tokenRoutes.length).toBeGreaterThan(0);
        for (const route of tokenRoutes) {
            expect(redactSensitiveText(route.replace(/:(?:token|uuid)$/, UUID))).toBe(route.replace(/:(?:token|uuid)$/, '[redacted]'));
        }
    });

    // React-router matches routes case-insensitively, so these urls serve the token pages too.
    it('redacts tokens whatever the path casing', () => {
        expect(redactSensitiveText(`/Signup/${UUID}`)).toBe('/Signup/[redacted]');
        expect(redactSensitiveText(`/Verify-Email/${UUID}`)).toBe('/Verify-Email/[redacted]');
        expect(redactSensitiveText(`/RESET-PASSWORD/${JWT}`)).toBe('/RESET-PASSWORD/[redacted]');
    });

    it('redacts tokens from the api urls the auth pages call', () => {
        expect(redactSensitiveText(`https://api.nango.dev/api/v1/invite/${UUID}`)).toBe('https://api.nango.dev/api/v1/invite/[redacted]');
        expect(redactSensitiveText('/api/v1/account/email/expired-token/tok')).toBe('/api/v1/account/email/expired-token/[redacted]');
        expect(redactSensitiveText(`/api/v1/account/email/${UUID}`)).toBe('/api/v1/account/email/[redacted]');
        expect(redactSensitiveText('/api/v1/invite?env=dev')).toBe('/api/v1/invite?env=dev');
    });

    it('does not let the broader rules swallow the more specific routes', () => {
        expect(redactSensitiveText('/signup/verification/tok')).not.toContain('/signup/[redacted]');
        expect(redactSensitiveText('/verify-email/expired/tok')).not.toContain('/verify-email/[redacted]/');
    });

    it('leaves token-free auth routes alone', () => {
        expect(redactSensitiveText('/signup')).toBe('/signup');
        expect(redactSensitiveText('/forgot-password')).toBe('/forgot-password');
        expect(redactSensitiveText('/signup/verification')).toBe('/signup/verification');
        expect(redactSensitiveText('/signup/verification?utm_source=email')).toBe('/signup/verification?utm_source=email');
        expect(redactSensitiveText('/verify-email/expired#top')).toBe('/verify-email/expired#top');
        expect(redactSensitiveText('a:href="/signup/verification"')).toBe('a:href="/signup/verification"');
    });

    // Sentry names transactions by the parameterized route pattern, never a real token.
    it('leaves parameterized route names alone', () => {
        expect(redactSensitiveText('/reset-password/:token')).toBe('/reset-password/:token');
        expect(redactSensitiveText('/signup/:token')).toBe('/signup/:token');
        expect(redactSensitiveText('/verify-email/:uuid')).toBe('/verify-email/:uuid');
        expect(redactSensitiveText('/signup/verification/:token')).toBe('/signup/verification/:token');
    });

    it('redacts the invite token from the ?next= param', () => {
        expect(redactSensitiveText('/signin?next=/signup/invite-token')).toBe('/signin?next=/signup/[redacted]');
        expect(redactSensitiveText('/signin?next=%2Fsignup%2Finvite-token')).toBe('/signin?next=%2Fsignup%2F[redacted]');
        expect(redactSensitiveText('/signin?next=/signup/invite-token&utm_source=x')).toBe('/signin?next=/signup/[redacted]&utm_source=x');
    });

    // Invite tokens are uuids, so the jwt catch-all can't rescue a missed ?next= variant.
    it('redacts the invite token whatever the encoding or case of the delimiters', () => {
        expect(redactSensitiveText(`/signin?next=%2fsignup%2f${UUID}`)).toBe('/signin?next=%2fsignup%2f[redacted]');
        expect(redactSensitiveText(`/signin?next=%2Fsignup/${UUID}`)).toBe('/signin?next=%2Fsignup/[redacted]');
        expect(redactSensitiveText(`/signin?next=/signup%2F${UUID}`)).toBe('/signin?next=/signup%2F[redacted]');
        expect(redactSensitiveText(`/signin?NEXT=%2FSignup%2F${UUID}`)).toBe('/signin?NEXT=%2FSignup%2F[redacted]');
    });

    it('redacts a jwt anywhere, whatever the surrounding shape', () => {
        expect(redactSensitiveText(`a:link:href="/x/${JWT}";div:nth-child="1"`)).toBe('a:link:href="/x/[redacted]";div:nth-child="1"');
        expect(redactSensitiveText(`/signin?next=%2Freset-password%2F${JWT}`)).toBe('/signin?next=%2Freset-password%2F[redacted]');
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
