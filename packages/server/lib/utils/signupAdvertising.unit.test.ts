import { afterEach, describe, expect, it, vi } from 'vitest';

import { envs } from '../env.js';
import { parseSignupAdvertising, signupAdvertisingFromRequest } from './signupAdvertising.js';

vi.mock('../env.js', () => ({
    envs: { SIGNUP_AD_CONTEXT_ENABLED: false, SIGNUP_AD_CONTEXT_COOKIE_NAME: 'nango_signup_ads_dev', SIGNUP_AD_CONTEXT_VERSION: 1 }
}));

const now = Date.parse('2026-10-20T12:00:00Z');
const accepted = {
    version: 1,
    marketing: true,
    gpc: false,
    method: 'explicit',
    gdpr: true,
    lgpd: false,
    ccpa: false,
    observedAt: now,
    fbclidAt: now - 60_000,
    fbclid: 'synthetic_meta',
    opprefAt: now - 30_000,
    oppref: 'synthetic_openai'
};

describe('optional signup ad context', () => {
    afterEach(() => {
        envs.SIGNUP_AD_CONTEXT_ENABLED = false;
        envs.SIGNUP_AD_CONTEXT_COOKIE_NAME = 'nango_signup_ads_dev';
        envs.SIGNUP_AD_CONTEXT_VERSION = 1;
        vi.useRealTimers();
    });

    it('preserves each click time and only returns allowlisted event properties', () => {
        expect(parseSignupAdvertising(JSON.stringify(accepted), now)).toEqual({
            advertising_consent_method: 'explicit',
            advertising_consent_timestamp: '2026-10-20T12:00:00.000Z',
            advertising_fbc: `fb.1.${now - 60_000}.synthetic_meta`,
            advertising_oppref: 'synthetic_openai',
            advertising_oppref_click_timestamp: '2026-10-20T11:59:30.000Z'
        });
    });

    it.each([
        { marketing: false },
        { gpc: true },
        { gpc: undefined },
        { method: 'implied', gdpr: true },
        { method: 'implied', gdpr: false, ccpa: null },
        { observedAt: now + 1 },
        { observedAt: now - 86_400_000 },
        { fbclidAt: now + 1, opprefAt: now + 1 },
        { fbclidAt: now - 86_400_000, opprefAt: now - 86_400_000 },
        { fbclid: undefined, oppref: undefined }
    ])('ignores invalid, denied or stale context: %j', (override) => {
        expect(parseSignupAdvertising(JSON.stringify({ ...accepted, ...override }), now)).toBeUndefined();
    });

    it('allows the CMP regional default only with known non-opt-in regional signals', () => {
        expect(parseSignupAdvertising(JSON.stringify({ ...accepted, method: 'implied', gdpr: false, lgpd: false, ccpa: true }), now)).toMatchObject({
            advertising_consent_method: 'implied'
        });
    });

    it('drops a stale platform click without changing the other click time', () => {
        const result = parseSignupAdvertising(JSON.stringify({ ...accepted, fbclidAt: now - 86_400_000 }), now);
        expect(result?.advertising_fbc).toBeUndefined();
        expect(result?.advertising_oppref_click_timestamp).toBe('2026-10-20T11:59:30.000Z');
    });

    it.each([undefined, null, {}, '{', 'x'.repeat(4097)])('ignores malformed cookie %j', (raw) => {
        expect(parseSignupAdvertising(raw, now)).toBeUndefined();
    });

    it('defaults off, isolates Dev/Prod cookies and respects current GPC and internal signup', () => {
        vi.useFakeTimers().setSystemTime(now);
        const req = { cookies: { nango_signup_ads_dev: JSON.stringify(accepted) }, headers: {} };
        expect(signupAdvertisingFromRequest(req, 'creator@example.invalid')).toBeUndefined();
        envs.SIGNUP_AD_CONTEXT_ENABLED = true;
        expect(signupAdvertisingFromRequest(req, 'creator@example.invalid')).toBeDefined();
        expect(signupAdvertisingFromRequest({ ...req, headers: { 'sec-gpc': '1' } }, 'creator@example.invalid')).toBeUndefined();
        expect(signupAdvertisingFromRequest(req, 'creator@NANGO.DEV')).toBeUndefined();
        envs.SIGNUP_AD_CONTEXT_COOKIE_NAME = 'nango_signup_ads_prod';
        expect(signupAdvertisingFromRequest(req, 'creator@example.invalid')).toBeUndefined();
        expect(
            signupAdvertisingFromRequest({ cookies: { nango_signup_ads_prod: JSON.stringify(accepted) }, headers: {} }, 'creator@example.invalid')
        ).toBeDefined();
        envs.SIGNUP_AD_CONTEXT_COOKIE_NAME = undefined;
        expect(signupAdvertisingFromRequest(req, 'creator@example.invalid')).toBeUndefined();
    });
});

describe('shared signup ad context compatibility', () => {
    const google = { clickType: 'gclid', clickId: 'synthetic_google', clickAt: now - 1000 };
    const v2 = { ...accepted, version: 2, google };
    const legacy = parseSignupAdvertising(JSON.stringify(accepted), now);

    it.each([1, 2] as const)('accepts the old writer with server capability %s without changing legacy fields', (gate) => {
        expect(parseSignupAdvertising(JSON.stringify(accepted), now, gate)).toEqual(legacy);
    });
    it('ignores lingering v2 Google data when the shared server gate is off, preserving Meta/ChatGPT', () => {
        expect(parseSignupAdvertising(JSON.stringify(v2), now, 1)).toEqual(legacy);
        expect(parseSignupAdvertising(JSON.stringify(v2), now)).toEqual(legacy);
    });
    it.each(['gclid', 'gbraid', 'wbraid'])('adds one valid %s under shared capability 2 and one consent snapshot', (clickType) => {
        expect(parseSignupAdvertising(JSON.stringify({ ...v2, google: { ...google, clickType } }), now, 2)).toEqual({
            ...legacy,
            advertising_google_click_type: clickType,
            advertising_google_click_id: 'synthetic_google',
            advertising_google_click_timestamp: '2026-10-20T11:59:59.000Z',
            advertising_google_ad_user_data: 'granted',
            advertising_google_ad_personalization: 'granted'
        });
    });
    it.each([undefined, null, 0, 3, '2'])('fails closed for missing or invalid envelope version %j', (version) => {
        expect(parseSignupAdvertising(JSON.stringify({ ...v2, version }), now, 2)).toBeUndefined();
    });
    it.each([
        undefined,
        null,
        [],
        'invalid',
        {},
        { ...google, clickType: 'utm' },
        { ...google, clickId: 'bad@email' },
        { ...google, clickId: 'a'.repeat(513) },
        { ...google, clickAt: now + 1 },
        { ...google, clickAt: now - 86_400_000 },
        { ...google, clickAt: 1.5 },
        { ...google, email: 'unexpected' }
    ])('invalid optional Google data preserves valid Meta/ChatGPT: %j', (value) => {
        expect(parseSignupAdvertising(JSON.stringify({ ...v2, google: value }), now, 2)).toEqual(legacy);
    });
    it('isolates invalid legacy clicks too and strips unknown metadata without emitting it', () => {
        const result = parseSignupAdvertising(
            JSON.stringify({ ...v2, fbclid: 'bad@id', oppref: '\nprivate', email: 'unexpected', is_signup_creator_internal: false }),
            now,
            2
        );
        expect(result).toMatchObject({ advertising_google_click_id: 'synthetic_google' });
        expect(Object.keys(result!)).toEqual([
            'advertising_consent_method',
            'advertising_consent_timestamp',
            'advertising_google_click_type',
            'advertising_google_click_id',
            'advertising_google_click_timestamp',
            'advertising_google_ad_user_data',
            'advertising_google_ad_personalization'
        ]);
    });
    it.each([{ marketing: false }, { gpc: true }, { method: 'implied', gdpr: true }, { observedAt: now - 86_400_000 }])(
        'applies shared consent and freshness to every network: %j',
        (override) => {
            expect(parseSignupAdvertising(JSON.stringify({ ...v2, ...override }), now, 2)).toBeUndefined();
        }
    );
    it('uses the same resolved regional-default policy for Google', () => {
        expect(parseSignupAdvertising(JSON.stringify({ ...v2, method: 'implied', gdpr: false, lgpd: false, ccpa: true }), now, 2)).toMatchObject({
            advertising_consent_method: 'implied',
            advertising_google_click_id: 'synthetic_google'
        });
    });
    it('uses the shared request gate and canonical creator classification, never cookie metadata', () => {
        vi.useFakeTimers().setSystemTime(now);
        const previous = { ...envs };
        try {
            envs.SIGNUP_AD_CONTEXT_ENABLED = true;
            envs.SIGNUP_AD_CONTEXT_VERSION = 2;
            const req = { cookies: { nango_signup_ads_dev: JSON.stringify({ ...v2, is_signup_creator_internal: false }) }, headers: {} };
            expect(signupAdvertisingFromRequest(req, 'external@nango.dev.example.com')).toMatchObject({
                is_signup_creator_internal: false,
                advertising_google_click_id: 'synthetic_google'
            });
            expect(signupAdvertisingFromRequest(req, 'internal@NANGO.DEV')).toBeUndefined();
            expect(signupAdvertisingFromRequest({ ...req, headers: { 'sec-gpc': '1' } }, 'external@example.com')).toBeUndefined();
            envs.SIGNUP_AD_CONTEXT_VERSION = 1;
            expect(signupAdvertisingFromRequest(req, 'external@example.com')).toEqual(legacy);
            envs.SIGNUP_AD_CONTEXT_ENABLED = false;
            expect(signupAdvertisingFromRequest(req, 'external@example.com')).toBeUndefined();
        } finally {
            Object.assign(envs, previous);
            vi.useRealTimers();
        }
    });
});
