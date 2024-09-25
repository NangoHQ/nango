import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { runServer, shouldBeProtected, isError, isSuccess } from '../../utils/tests.js';
import { seeders } from '@nangohq/shared';
import db, { multipleMigrations } from '@nangohq/database';
import type { DBEnvironment } from '@nangohq/types';
import { migrate as migrateKeystore } from '@nangohq/keystore';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connect/sessions';

describe(`POST ${endpoint}`, () => {
    let seed: { env: DBEnvironment };

    beforeAll(async () => {
        await multipleMigrations();
        await migrateKeystore(db.knex);
        seed = await seeders.seedAccountEnvAndUser();
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            // @ts-expect-error on purpose
            body: {}
        });

        shouldBeProtected(res);
    });

    it('should fail if no linkedProfile', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            // @ts-expect-error on purpose
            body: {}
        });

        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_request',
                errors: [{ code: 'invalid_type', message: 'Required', path: ['linkedProfile'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should fail if no linkedProfile.profileId', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                // @ts-expect-error on purpose
                linkedProfile: {}
            }
        });

        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_request',
                errors: [{ code: 'invalid_type', message: 'Required', path: ['linkedProfile', 'profileId'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should fail if new linkedProfile but no email', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                linkedProfile: {
                    profileId: 'newId'
                }
            }
        });

        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_request',
                errors: [{ code: 'invalid_type', message: 'email is required', path: ['linkedProfile', 'email'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should return new connectSessionToken', async () => {
        // first request create a linked profile
        const profileId = 'knownId';
        await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { linkedProfile: { profileId, email: 'a@b.com' } }
        });

        // 2nd request doesn't require the email
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                linkedProfile: { profileId }
            }
        });
        isSuccess(res.json);
    });
});
