import { afterEach, describe, expect, it, vi } from 'vitest';

import { envs } from '../env.js';
import { signupAdvertisingFromRequest } from './signupAdvertising.js';
import { parseSignupSocialAdvertising } from './signupSocialAdvertising.js';

vi.mock('../env.js', () => ({
    envs: {
        SIGNUP_X_CONTEXT_ENABLED: false,
        SIGNUP_X_CONTEXT_COOKIE_NAME: 'x_dev',
        SIGNUP_REDDIT_CONTEXT_ENABLED: false,
        SIGNUP_REDDIT_CONTEXT_COOKIE_NAME: 'reddit_dev'
    }
}));
const now = Date.parse('2026-10-23T07:00:00Z');
const accepted = {
    version: 1,
    marketing: true,
    gpc: false,
    method: 'explicit',
    gdpr: true,
    lgpd: false,
    ccpa: false,
    observedAt: now,
    clickId: 'testclick',
    clickAt: now - 1000
};

describe.each(['x', 'reddit'] as const)('%s signup click parsing', (platform) => {
    afterEach(() => {
        envs.SIGNUP_X_CONTEXT_ENABLED = false;
        envs.SIGNUP_REDDIT_CONTEXT_ENABLED = false;
        vi.useRealTimers();
    });
    it('preserves only platform click and signup consent snapshot', () => {
        expect(parseSignupSocialAdvertising(JSON.stringify(accepted), platform, now)).toEqual({
            [`advertising_${platform}_click_id`]: 'testclick',
            [`advertising_${platform}_click_timestamp`]: new Date(now - 1000).toISOString(),
            [`advertising_${platform}_consent_method`]: 'explicit',
            [`advertising_${platform}_consent_timestamp`]: new Date(now).toISOString()
        });
    });
    it.each([
        { marketing: false },
        { gpc: true },
        { gpc: undefined },
        { clickId: 'bad@email' },
        { clickId: 'a'.repeat(513) },
        { clickAt: now + 1 },
        { clickAt: now - 86_400_000 },
        { observedAt: now + 1 },
        { observedAt: now - 86_400_000 },
        { method: 'implied' },
        { method: 'implied', gdpr: false, lgpd: false, ccpa: null },
        { email: 'private' },
        { is_signup_creator_internal: false },
        { company: '123' }
    ])('rejects invalid or extra data %j', (override) => {
        expect(parseSignupSocialAdvertising(JSON.stringify({ ...accepted, ...override }), platform, now)).toBeUndefined();
    });
    it.each([null, undefined, {}, '{', 'a'.repeat(4097)])('ignores malformed cookie %j', (raw) =>
        expect(parseSignupSocialAdvertising(raw, platform, now)).toBeUndefined()
    );
    it('accepts only resolved non-opt-in implied choice', () =>
        expect(
            parseSignupSocialAdvertising(JSON.stringify({ ...accepted, method: 'implied', gdpr: false, lgpd: false, ccpa: true }), platform, now)
        ).toMatchObject({ [`advertising_${platform}_consent_method`]: 'implied' }));
    it('independently gates rollout, trusts server creator identity, blocks GPC and ignores other environment cookie', () => {
        vi.useFakeTimers().setSystemTime(now);
        const req = { cookies: { x_dev: JSON.stringify(accepted), reddit_dev: JSON.stringify(accepted) }, headers: {} };
        expect(signupAdvertisingFromRequest(req, 'external@example.com')).toBeUndefined();
        if (platform === 'x') envs.SIGNUP_X_CONTEXT_ENABLED = true;
        else envs.SIGNUP_REDDIT_CONTEXT_ENABLED = true;
        expect(signupAdvertisingFromRequest(req, 'external@nango.dev.example.com')).toEqual({
            ...parseSignupSocialAdvertising(JSON.stringify(accepted), platform, now),
            is_signup_creator_internal: false
        });
        expect(signupAdvertisingFromRequest(req, 'internal@NANGO.DEV')).toBeUndefined();
        expect(signupAdvertisingFromRequest({ ...req, headers: { 'sec-gpc': '1' } }, 'external@example.com')).toBeUndefined();
        expect(
            signupAdvertisingFromRequest({ cookies: { [`${platform}_prod`]: JSON.stringify(accepted) }, headers: {} }, 'external@example.com')
        ).toBeUndefined();
        expect(signupAdvertisingFromRequest({ cookies: {}, headers: {} }, 'external@example.com')).toBeUndefined();
    });
});
