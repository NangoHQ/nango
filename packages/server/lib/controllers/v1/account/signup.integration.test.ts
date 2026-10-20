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

    it('tracks only the user for an invite signup even when acquisition is sent', async () => {
        const { account, user: inviter } = await seeders.seedAccountEnvAndUser();
        const email = `${nanoid()}@example.com`;
        const invitation = await inviteEmail({ email, name: email, accountId: account.id, invitedByUserId: inviter.id, role: 'administrator', trx: db.knex });
        const track = vi.spyOn(productTracking, 'track');

        const res = await api.fetch(route, {
            method: 'POST',
            body: { email, name: 'Foobar', password: 'aZ1-foobar!!', token: invitation!.token, acquisition: { acquisition_utm_source: 'facebook' } }
        });
        expect(res.res.status).toBe(200);

        const names = track.mock.calls.map(([event]) => event.name);
        expect(names).toStrictEqual(['auth:user_create']);
        track.mockRestore();
    });
    it('passes permitted cookie context on one account event, without creating another conversion on retry', async () => {
        const previous = envs.SIGNUP_AD_CONTEXT_ENABLED;
        envs.SIGNUP_AD_CONTEXT_ENABLED = true;
        const track = vi.spyOn(productTracking, 'track');
        const now = Date.now();
        const context = {
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
                        advertising_oppref: 'synthetic_openai',
                        is_advertising_allowed: true
                    })
                })
            );
            const second = await api.fetch(route, { method: 'POST', body, headers });
            expect(second.res.status).toBe(400);
            expect(track.mock.calls.filter(([e]) => e.name === 'auth:account_create')).toHaveLength(1);
        } finally {
            envs.SIGNUP_AD_CONTEXT_ENABLED = previous;
            track.mockRestore();
        }
    });
});
