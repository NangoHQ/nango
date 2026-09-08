import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected, shouldRequireSessionEnv } from '../../../utils/tests.js';

const route = '/api/v1/team';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`PUT ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'PUT', query: { env: 'dev' }, body: { name: '' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { session, params: { operationId: '1' } }
        );

        shouldRequireSessionEnv(res);
    });

    it('should validate body', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            session,
            // @ts-expect-error on purpose
            body: { name: 1 }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_type', message: 'Invalid input: expected string, received number', path: ['name'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should put team name', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            session,
            body: { name: 'hello' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                name: 'hello'
            }
        });
    });
});
