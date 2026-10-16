import { beforeEach, describe, expect, it, vi } from 'vitest';

import { advertisingConsentConfig, consumeManagedSignupConsent, prepareManagedSignupConsent, signupConsentFromRequest } from './advertisingConsent.service.js';

import type { Request } from 'express';

const state = vi.hoisted(() => ({
    envs: { ADVERTISING_CONSENT_ENABLED: true, ADVERTISING_CONSENT_ORIGINS: 'https://nango.dev', ADVERTISING_CONSENT_LIFETIME_DAYS: 30 },
    read: vi.fn()
}));
vi.mock('../env.js', () => ({ envs: state.envs }));
vi.mock('@nangohq/utils', () => ({ isLocal: false, basePublicUrl: 'https://app.nango.dev', baseUrl: 'https://api.nango.dev' }));
vi.mock('@nangohq/shared', () => ({ consentOwnerHash: (token: string) => `hashed-${token}`, readAdvertisingConsent: state.read }));

function request(headers: Record<string, string> = { 'User-Agent': 'Signup browser', Origin: 'https://app.nango.dev' }) {
    return {
        cookies: { '__Host-nango_ad_consent': 'a'.repeat(64) },
        get: (name: string) => headers[name],
        session: { save: vi.fn((callback: (err?: Error) => void) => callback()) }
    } as unknown as Request;
}

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state.envs, { ADVERTISING_CONSENT_ENABLED: true, ADVERTISING_CONSENT_ORIGINS: 'https://nango.dev', ADVERTISING_CONSENT_LIFETIME_DAYS: 30 });
    state.read.mockResolvedValue({ id: 'context', revision: 2, expires_at: new Date(Date.now() + 60000) });
});

describe('signup consent continuation', () => {
    it('binds only a bounded browser UA and an allowed app route', async () => {
        expect((await signupConsentFromRequest(request(), '/signup'))?.browser).toEqual({
            userAgent: 'Signup browser',
            sourceUrl: 'https://app.nango.dev/signup'
        });
        expect(
            (await signupConsentFromRequest(request({ Origin: 'https://pr-7933.app.nango.dev', 'User-Agent': 'Preview' }), '/signin'))?.browser?.sourceUrl
        ).toBe('https://pr-7933.app.nango.dev/signin');
        for (const origin of ['https://app.nango.dev.attacker.test', 'https://app.nango.dev/?token=secret', 'https://user:secret@app.nango.dev', 'null']) {
            expect((await signupConsentFromRequest(request({ Origin: origin }), '/signup'))?.browser).toEqual({});
        }
        for (const userAgent of ['a'.repeat(1025), 'agent\nsecret', '']) {
            expect((await signupConsentFromRequest(request({ 'User-Agent': userAgent }), '/signup'))?.browser).toEqual({});
        }
        expect((await signupConsentFromRequest(request()))?.browser?.sourceUrl).toBeUndefined();
    });
    it('requires explicit configuration and exact HTTPS origins', () => {
        expect(advertisingConsentConfig()).not.toBeNull();
        state.envs.ADVERTISING_CONSENT_ORIGINS = '*';
        expect(advertisingConsentConfig()).toBeNull();
        state.envs.ADVERTISING_CONSENT_ORIGINS = 'http://nango.dev';
        expect(advertisingConsentConfig()).toBeNull();
        state.envs.ADVERTISING_CONSENT_ORIGINS = 'https://nango.dev/path';
        expect(advertisingConsentConfig()).toBeNull();
    });
    it('resolves only an owned, unexpired server record', async () => {
        const req = request();
        const reference = await signupConsentFromRequest(req);
        expect(reference).toMatchObject({ id: 'context', revision: 2 });
        expect(reference?.signupId).toMatch(/^[a-f0-9-]{36}$/);
        state.read.mockResolvedValueOnce({ id: 'context', revision: 2, expires_at: new Date(0) });
        expect(await signupConsentFromRequest(req)).toBeUndefined();
        req.cookies = {};
        expect(await signupConsentFromRequest(req)).toBeUndefined();
    });
    it('keeps email signup working if the lookup fails', async () => {
        state.read.mockRejectedValueOnce(new Error('unavailable'));
        expect(await signupConsentFromRequest(request())).toBeUndefined();
    });
    it('binds Google continuation to the initiating session and consumes it once', async () => {
        const req = request();
        const nonce = await prepareManagedSignupConsent(req, '/signup');
        expect(nonce).toMatch(/^[a-f0-9]{64}$/);
        expect(await consumeManagedSignupConsent(request(), nonce)).toBeUndefined();
        vi.spyOn(req, 'get').mockReturnValue('Callback browser');
        const reference = await consumeManagedSignupConsent(req, nonce);
        expect(reference).toMatchObject({ id: 'context', revision: 2 });
        expect(reference?.browser).toEqual({ userAgent: 'Signup browser', sourceUrl: 'https://app.nango.dev/signup' });
        expect(reference?.signupId).toMatch(/^[a-f0-9-]{36}$/);
        expect(await consumeManagedSignupConsent(req, nonce)).toBeUndefined();
    });
    it('drops optional tracking if saving the Google session fails', async () => {
        const req = request();
        vi.spyOn(req.session, 'save').mockImplementationOnce((callback) => {
            callback?.(new Error('offline'));
            return req.session;
        });
        expect(await prepareManagedSignupConsent(req)).toBeUndefined();
        expect(req.session.advertisingConsentContinuations).toEqual({});
    });
    it('rejects expired and disabled continuations', async () => {
        const req = request();
        const nonce = await prepareManagedSignupConsent(req);
        const continuation = nonce ? req.session.advertisingConsentContinuations?.[nonce] : undefined;
        if (!continuation) throw new Error('Missing continuation');
        continuation.expiresAt = 0;
        expect(await consumeManagedSignupConsent(req, nonce)).toBeUndefined();
        state.envs.ADVERTISING_CONSENT_ENABLED = false;
        expect(await prepareManagedSignupConsent(request())).toBeUndefined();
    });
});
