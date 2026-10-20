import { afterEach, describe, expect, it, vi } from 'vitest';

import { envs } from '../env.js';
import { parseSignupAdvertising, signupAdvertisingFromRequest } from './signupAdvertising.js';

vi.mock('../env.js', () => ({ envs: { SIGNUP_AD_CONTEXT_ENABLED: false, SIGNUP_AD_CONTEXT_COOKIE_NAME: 'nango_signup_ads_dev' } }));

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
        vi.useRealTimers();
    });

    it('preserves each click time and only returns allowlisted event properties', () => {
        expect(parseSignupAdvertising(JSON.stringify(accepted), now)).toEqual({
            is_advertising_allowed: true,
            is_advertising_gpc: false,
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
        { fbclid: 'bad@id' },
        { oppref: '\nprivate' },
        { email: 'unexpected@example.invalid' },
        { fbclid: undefined, oppref: undefined }
    ])('ignores invalid, denied or stale context: %j', (override) => {
        expect(parseSignupAdvertising(JSON.stringify({ ...accepted, ...override }), now)).toBeUndefined();
    });

    it('allows the CMP regional default only with known non-opt-in regional signals', () => {
        expect(parseSignupAdvertising(JSON.stringify({ ...accepted, method: 'implied', gdpr: false, lgpd: false, ccpa: true }), now)).toMatchObject({
            advertising_consent_method: 'implied',
            is_advertising_allowed: true
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
        expect(
            signupAdvertisingFromRequest({ cookies: { nango_signup_ads_prod: JSON.stringify(accepted) }, headers: {} }, 'creator@example.invalid')
        ).toBeUndefined();
    });
});
