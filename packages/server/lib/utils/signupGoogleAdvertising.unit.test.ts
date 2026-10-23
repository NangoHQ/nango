import { afterEach, describe, expect, it, vi } from 'vitest';

import { envs } from '../env.js';
import { parseSignupAdvertising, signupAdvertisingFromRequest } from './signupAdvertising.js';
import { parseSignupGoogleAdvertising } from './signupGoogleAdvertising.js';

vi.mock('../env.js', () => ({
    envs: {
        SIGNUP_AD_CONTEXT_ENABLED: true,
        SIGNUP_AD_CONTEXT_COOKIE_NAME: 'meta_dev',
        SIGNUP_GOOGLE_CONTEXT_ENABLED: false,
        SIGNUP_GOOGLE_CONTEXT_COOKIE_NAME: 'google_dev'
    }
}));
const now = Date.parse('2026-10-22T20:00:00Z');
const accepted = {
    version: 1,
    marketing: true,
    gpc: false,
    method: 'explicit',
    gdpr: true,
    lgpd: false,
    ccpa: false,
    observedAt: now,
    clickType: 'gclid',
    clickId: 'synthetic_click',
    clickAt: now - 1000,
    adUserData: 'granted',
    adPersonalization: 'granted'
};

describe('separate optional Google signup context', () => {
    afterEach(() => {
        envs.SIGNUP_GOOGLE_CONTEXT_ENABLED = false;
        envs.SIGNUP_GOOGLE_CONTEXT_COOKIE_NAME = 'google_dev';
        vi.useRealTimers();
    });
    it.each(['gclid', 'gbraid', 'wbraid'])('preserves genuine %s with independent consent timestamp', (clickType) => {
        expect(parseSignupGoogleAdvertising(JSON.stringify({ ...accepted, clickType }), now)).toEqual({
            advertising_google_click_type: clickType,
            advertising_google_click_id: 'synthetic_click',
            advertising_google_click_timestamp: '2026-10-22T19:59:59.000Z',
            advertising_google_consent_method: 'explicit',
            advertising_google_consent_timestamp: '2026-10-22T20:00:00.000Z',
            advertising_google_ad_user_data: 'granted',
            advertising_google_ad_personalization: 'granted'
        });
    });
    it.each([
        { marketing: false },
        { gpc: true },
        { gpc: undefined },
        { adUserData: 'denied' },
        { adPersonalization: undefined },
        { clickId: 'bad@email' },
        { clickId: 'a'.repeat(513) },
        { clickType: 'utm' },
        { clickAt: now + 1 },
        { clickAt: now - 86_400_000 },
        { observedAt: now + 1 },
        { observedAt: now - 86_400_000 },
        { method: 'implied' },
        { method: 'implied', gdpr: false, lgpd: false, ccpa: null },
        { email: 'unexpected' }
    ])('omits invalid or denied context %j', (override) => {
        expect(parseSignupGoogleAdvertising(JSON.stringify({ ...accepted, ...override }), now)).toBeUndefined();
    });
    it.each([null, undefined, {}, '{', 'a'.repeat(4097)])('ignores malformed optional cookie %j', (raw) =>
        expect(parseSignupGoogleAdvertising(raw, now)).toBeUndefined()
    );
    it('allows resolved US defaults without claiming explicit consent', () => {
        expect(parseSignupGoogleAdvertising(JSON.stringify({ ...accepted, method: 'implied', gdpr: false, lgpd: false, ccpa: true }), now)).toMatchObject({
            advertising_google_consent_method: 'implied'
        });
    });
    it('derives creator classification only on permitted Google context, never from the cookie', () => {
        vi.useFakeTimers().setSystemTime(now);
        envs.SIGNUP_GOOGLE_CONTEXT_ENABLED = true;
        const req = { cookies: { google_dev: JSON.stringify(accepted) }, headers: {} };
        expect(signupAdvertisingFromRequest(req, 'external@example.com')).toMatchObject({ is_signup_creator_internal: false });
        expect(signupAdvertisingFromRequest(req, 'external@nango.dev.example.com')).toMatchObject({ is_signup_creator_internal: false });
        expect(signupAdvertisingFromRequest(req, 'internal@NANGO.DEV')).toBeUndefined();
        expect(
            signupAdvertisingFromRequest(
                { ...req, cookies: { google_dev: JSON.stringify({ ...accepted, is_signup_creator_internal: false }) } },
                'internal@nango.dev'
            )
        ).toBeUndefined();
        expect(parseSignupGoogleAdvertising(JSON.stringify(accepted), now)).not.toHaveProperty('is_signup_creator_internal');
        expect(parseSignupGoogleAdvertising(JSON.stringify({ ...accepted, is_signup_creator_internal: false }), now)).toBeUndefined();
    });
    it('preserves legacy cookie parsing and independently gates both platforms', () => {
        vi.useFakeTimers().setSystemTime(now);
        const { clickType, clickId, clickAt, adUserData, adPersonalization, ...base } = accepted;
        const meta = JSON.stringify({ ...base, fbclid: 'synthetic_meta', fbclidAt: now - 2000 });
        const req = { cookies: { meta_dev: meta, google_dev: JSON.stringify(accepted) }, headers: {} };
        const original = parseSignupAdvertising(meta, now);
        expect(signupAdvertisingFromRequest(req, 'creator@example.com')).toEqual(original);
        envs.SIGNUP_GOOGLE_CONTEXT_ENABLED = true;
        expect(signupAdvertisingFromRequest(req, 'creator@example.com')).toEqual({
            ...original,
            ...parseSignupGoogleAdvertising(JSON.stringify(accepted), now),
            is_signup_creator_internal: false
        });
        expect(signupAdvertisingFromRequest({ ...req, headers: { 'sec-gpc': '1' } }, 'creator@example.com')).toBeUndefined();
        expect(signupAdvertisingFromRequest(req, 'creator@NANGO.DEV')).toBeUndefined();
        expect(signupAdvertisingFromRequest({ ...req, cookies: { ...req.cookies, google_dev: '{' } }, 'creator@example.com')).toEqual(original);
        envs.SIGNUP_GOOGLE_CONTEXT_COOKIE_NAME = 'google_prod';
        expect(signupAdvertisingFromRequest(req, 'creator@example.com')).toEqual(original);
        expect(signupAdvertisingFromRequest({ ...req, cookies: { google_prod: JSON.stringify(accepted) } }, 'creator@example.com')).toMatchObject({
            advertising_google_click_id: 'synthetic_click'
        });
    });
});
