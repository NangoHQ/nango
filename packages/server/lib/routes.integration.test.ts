import { migrateLogsMapping } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import db, { multipleMigrations } from '@nangohq/database';
import { migrate as migrateKeystore } from '@nangohq/keystore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runServer } from './utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
describe('route', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await migrateLogsMapping();
        await migrateKeystore(db.knex);

        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    describe('GET /logs', () => {
        it('should handle invalid json', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();
            const res = await fetch(`${api.url}/api/v1/environment/callback`, {
                method: 'POST',
                body: 'undefined',
                headers: { Authorization: `Bearer ${env.secret_key}`, 'content-type': 'application/json' }
            });

            expect(await res.json()).toStrictEqual({
                error: {
                    code: 'invalid_json',
                    message: expect.any(String) // unfortunately the message is different depending on the platform
                }
            });
        });
    });

    describe('GET /integrations', () => {
        it('should fail if no Authorization header', async () => {
            const res = await fetch(`${api.url}/integrations`);
            expect(res.status).toBe(401);
            expect(await res.json()).toMatchObject({
                error: {
                    code: 'missing_auth_header',
                    message: 'Authentication failed. The request is missing the Authorization header.'
                }
            });
        });
        it('should fail if Authorization bearer is wrong format ', async () => {
            const res = await fetch(`${api.url}/integrations`, {
                headers: { Authorization: `Bearer WRONG` }
            });
            expect(res.status).toBe(401);
            expect(await res.json()).toMatchObject({
                error: {
                    code: 'invalid_secret_key_format',
                    message: 'Authentication failed. The provided secret key is not a UUID v4.'
                }
            });
        });
        it('should be authorized by env private key', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();
            const res = await fetch(`${api.url}/integrations`, {
                headers: { Authorization: `Bearer ${env.secret_key}` }
            });
            expect(res.status).toBe(200);
        });
        it('should be authorized by connect session token', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();
            const getSession = await fetch(`${api.url}/connect/sessions`, {
                method: 'POST',
                body: JSON.stringify({
                    end_user: { id: '123', email: 'a@b.com' }
                }),
                headers: { Authorization: `Bearer ${env.secret_key}`, 'content-type': 'application/json' }
            });
            const {
                data: { token }
            } = (await getSession.json()) as { data: { token: string } };
            const res = await fetch(`${api.url}/integrations`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(200);
        });
    });
});
