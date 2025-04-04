import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { environmentService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/environments';

describe(`PATCH ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            // @ts-expect-error query params are required
            query: { env: 'test' },
            body: { name: 'new-name' }
        });

        shouldBeProtected(res);
    });

    it('should successfully rename an environment', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const newName = 'renamed-env';

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            // @ts-expect-error query params are required
            query: { env: env.name },
            body: { name: newName },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: expect.objectContaining({
                id: expect.any(Number),
                name: newName,
                account_id: expect.any(Number),
                created_at: expect.any(String),
                updated_at: expect.any(String)
            })
        });
    });

    it('should not allow renaming to an existing environment name', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();
        await environmentService.createEnvironment(account.id, 'existing');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            // @ts-expect-error query params are required
            query: { env: env.name },
            body: { name: 'existing' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'conflict',
                message: 'An environment with this name already exists'
            }
        });
    });
});
