import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

const route = '/api/v1/invite';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'POST', query: { env: 'dev' }, body: { emails: [] } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'POST',
            token: env.secret_key,
            body: { emails: [] },
            // @ts-expect-error missing query on purpose
            query: {}
        });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { emails: 1 }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_type', message: 'Invalid input: expected array, received number', path: ['emails'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should invite a user', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            body: { emails: ['foo@example.com'] },
            session
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                invited: ['foo@example.com']
            }
        });
    });
});
