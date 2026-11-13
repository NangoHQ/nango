import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { inviteEmail, productTracking, seeders, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { isSuccess, runServer } from '../../../utils/tests.js';

const route = '/api/v1/account/signup';
let api: Awaited<ReturnType<typeof runServer>>;
describe('POST /api/v1/account/signup', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should not be protected', async () => {
        const res = await api.fetch(route, {
            method: 'POST',
            // @ts-expect-error invalid body on purpose
            body: {}
        });

        expect(res.res.status).toBe(400);
    });

    it('should validate body', async () => {
        const res = await api.fetch(route, {
            method: 'POST',
            // @ts-expect-error invalid body on purpose
            body: {}
        });

        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['email'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['password'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['name'] }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should enforce password strength', async () => {
        const res = await api.fetch(route, { method: 'POST', body: { email: 'a@example.com', name: 'Foobar', password: '123456789101', foundUs: '' } });

        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'custom',
                        message: 'Password should be least 12 characters with uppercase, a number and a special character',
                        path: ['password']
                    }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should signup', async () => {
        const res = await api.fetch(route, {
            method: 'POST',
            body: { email: `${nanoid()}@example.com`, name: 'Foobar', password: 'aZ1-foobar!!', foundUs: 'the internet' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.verified).toBe(false);
        expect(typeof res.json.data.uuid).toBe('string');
    });

    it.each([
        { domain: 'nango.dev', isInternal: true },
        { domain: 'example.com', isInternal: false }
    ])('marks the new account internal=$isInternal for a @$domain signup', async ({ domain, isInternal }) => {
        const identifyAccountGroup = vi.spyOn(productTracking, 'identifyAccountGroup');
        const email = `${nanoid()}@${domain}`;

        const res = await api.fetch(route, { method: 'POST', body: { email, name: 'Foobar', password: 'aZ1-foobar!!', foundUs: 'the internet' } });
        expect(res.res.status).toBe(200);

        const user = await userService.getUserByEmail(email);
        await vi.waitFor(() => expect(identifyAccountGroup).toHaveBeenCalledWith(user!.account_id, { is_internal: isInternal }));
        identifyAccountGroup.mockRestore();
    });

    it('tracks a new account and user', async () => {
        const track = vi.spyOn(productTracking, 'track');
        const email = `${nanoid()}@example.com`;

        const res = await api.fetch(route, { method: 'POST', body: { email, name: 'Foobar', password: 'aZ1-foobar!!' } });
        expect(res.res.status).toBe(200);

        const user = await userService.getUserByEmail(email);
        const names = track.mock.calls.map(([event]) => event.name);
        expect(names).toStrictEqual(['auth:account_create', 'auth:user_create']);
        expect(track).toHaveBeenCalledWith(expect.objectContaining({ name: 'auth:user_create', user: expect.objectContaining({ id: user!.id }) }));
        track.mockRestore();
    });

    it('tracks only the user for an invited signup even with a valid shared Google cookie', async () => {
        const { account, user: inviter } = await seeders.seedAccountEnvAndUser();
        const email = `${nanoid()}@example.com`;
        const invitation = await inviteEmail({ email, name: email, accountId: account.id, invitedByUserId: inviter.id, role: 'administrator', trx: db.knex });
        const previous = { enabled: envs.SIGNUP_AD_CONTEXT_ENABLED, name: envs.SIGNUP_AD_CONTEXT_COOKIE_NAME, version: envs.SIGNUP_AD_CONTEXT_VERSION };
        envs.SIGNUP_AD_CONTEXT_ENABLED = true;
        envs.SIGNUP_AD_CONTEXT_COOKIE_NAME = 'nango_signup_ads_test';
        envs.SIGNUP_AD_CONTEXT_VERSION = 2;
        const now = Date.now();
        const context = {
            version: 2,
            marketing: true,
            gpc: false,
            method: 'explicit',
            gdpr: true,
            lgpd: false,
            ccpa: false,
            observedAt: now,
            google: { clickType: 'gclid', clickId: 'synthetic_google', clickAt: now - 1000 }
        };
        const track = vi.spyOn(productTracking, 'track');
        try {
            const res = await api.fetch(route, {
                method: 'POST',
                headers: { Cookie: `nango_signup_ads_test=${encodeURIComponent(JSON.stringify(context))}` },
                body: { email, name: 'Foobar', password: 'aZ1-foobar!!', token: invitation!.token, acquisition: { acquisition_utm_source: 'facebook' } }
            });
            expect(res.res.status).toBe(200);
            expect(track.mock.calls.map(([event]) => event.name)).toStrictEqual(['auth:user_create']);
        } finally {
            envs.SIGNUP_AD_CONTEXT_ENABLED = previous.enabled;
            envs.SIGNUP_AD_CONTEXT_COOKIE_NAME = previous.name;
            envs.SIGNUP_AD_CONTEXT_VERSION = previous.version;
            track.mockRestore();
        }
    });
    it.each(['denied', 'withdrawn', 'gpc', 'missing-version', 'invalid-version'] as const)(
        'allows signup without advertising fields when consent is %s',
        async (scenario) => {
            const previous = envs.SIGNUP_AD_CONTEXT_ENABLED;
            const previousCookieName = envs.SIGNUP_AD_CONTEXT_COOKIE_NAME;
            const previousVersion = envs.SIGNUP_AD_CONTEXT_VERSION;
            envs.SIGNUP_AD_CONTEXT_VERSION = 2;
            envs.SIGNUP_AD_CONTEXT_ENABLED = true;
            envs.SIGNUP_AD_CONTEXT_COOKIE_NAME = 'nango_signup_ads_test';
            const track = vi.spyOn(productTracking, 'track');
            const now = Date.now();
            const context = {
                version: scenario === 'missing-version' ? undefined : scenario === 'invalid-version' ? 3 : 2,
                marketing: scenario !== 'denied',
                gpc: false,
                method: 'explicit',
                gdpr: true,
                lgpd: false,
                ccpa: false,
                observedAt: now,
                google: { clickType: 'wbraid', clickId: 'synthetic_google', clickAt: now - 1000 },
                fbclidAt: now,
                fbclid: 'synthetic_meta',
                opprefAt: now,
                oppref: 'synthetic_openai'
            };
            const headers: Record<string, string> = {};
            if (scenario !== 'withdrawn') headers['Cookie'] = `${envs.SIGNUP_AD_CONTEXT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(context))}`;
            if (scenario === 'gpc') headers['sec-gpc'] = '1';
            try {
                const res = await api.fetch(route, {
                    method: 'POST',
                    body: { email: `${nanoid()}@example.com`, name: 'Consent fixture', password: 'aZ1-foobar!!' },
                    headers
                });
                expect(res.res.status).toBe(200);
                const accountEvents = track.mock.calls.filter(([event]) => event.name === 'auth:account_create');
                expect(accountEvents).toHaveLength(1);
                const fields = Object.keys(accountEvents[0]?.[0].eventProperties ?? {});
                expect(fields.filter((key) => key.startsWith('advertising_') || key.startsWith('is_advertising_'))).toEqual([]);
            } finally {
                envs.SIGNUP_AD_CONTEXT_ENABLED = previous;
                envs.SIGNUP_AD_CONTEXT_COOKIE_NAME = previousCookieName;
                envs.SIGNUP_AD_CONTEXT_VERSION = previousVersion;
                track.mockRestore();
            }
        }
    );

    it.each([
        { cookieVersion: 1, gate: 1 },
        { cookieVersion: 1, gate: 2 },
        { cookieVersion: 2, gate: 1 },
        { cookieVersion: 2, gate: 2 }
    ] as const)('preserves shared context for cookie $cookieVersion / gate $gate and deduplicates signup retries', async ({ cookieVersion, gate }) => {
        const previous = envs.SIGNUP_AD_CONTEXT_ENABLED;
        const previousCookieName = envs.SIGNUP_AD_CONTEXT_COOKIE_NAME;
        const previousVersion = envs.SIGNUP_AD_CONTEXT_VERSION;
        envs.SIGNUP_AD_CONTEXT_VERSION = gate;
        envs.SIGNUP_AD_CONTEXT_ENABLED = true;
        envs.SIGNUP_AD_CONTEXT_COOKIE_NAME = 'nango_signup_ads_test';
        const track = vi.spyOn(productTracking, 'track');
        const now = Date.now();
        const context = {
            version: cookieVersion,
            marketing: true,
            gpc: false,
            method: 'explicit',
            gdpr: true,
            lgpd: false,
            ccpa: false,
            observedAt: now,
            google: { clickType: 'wbraid', clickId: 'synthetic_google', clickAt: now - 1000 },
            fbclidAt: now - 60_000,
            fbclid: 'synthetic_meta',
            opprefAt: now - 30_000,
            oppref: 'synthetic_openai'
        };
        const body = { email: `${nanoid()}@example.com`, name: 'Consent fixture', password: 'aZ1-foobar!!' };
        const headers = { Cookie: `${envs.SIGNUP_AD_CONTEXT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(context))}` };
        try {
            const first = await api.fetch(route, { method: 'POST', body, headers });
            expect(first.res.status).toBe(200);
            expect(track.mock.calls.filter(([e]) => e.name === 'auth:account_create')).toHaveLength(1);
            expect(track).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'auth:account_create',
                    eventProperties: expect.objectContaining({
                        advertising_fbc: `fb.1.${now - 60_000}.synthetic_meta`,
                        advertising_oppref: 'synthetic_openai'
                    })
                })
            );
            const properties = track.mock.calls.find(([event]) => event.name === 'auth:account_create')?.[0].eventProperties;
            if (cookieVersion === 2 && gate === 2) {
                expect(properties).toMatchObject({
                    is_signup_creator_internal: false,
                    advertising_google_click_type: 'wbraid',
                    advertising_google_click_id: 'synthetic_google'
                });
            } else {
                expect(Object.keys(properties ?? {}).filter((key) => key.startsWith('advertising_google_') || key === 'is_signup_creator_internal')).toEqual(
                    []
                );
            }
            const second = await api.fetch(route, { method: 'POST', body, headers });
            expect(second.res.status).toBe(400);
            expect(track.mock.calls.filter(([e]) => e.name === 'auth:account_create')).toHaveLength(1);
        } finally {
            envs.SIGNUP_AD_CONTEXT_ENABLED = previous;
            envs.SIGNUP_AD_CONTEXT_COOKIE_NAME = previousCookieName;
            envs.SIGNUP_AD_CONTEXT_VERSION = previousVersion;
            track.mockRestore();
        }
    });
});
