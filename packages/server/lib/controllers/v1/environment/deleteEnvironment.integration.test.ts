import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PROD_ENVIRONMENT_NAME, environmentService, seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/environments';

describe(`DELETE ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: 'test' }
        });

        shouldBeProtected(res);
    });

    it('should not allow deleting prod environment', async () => {
        const { account } = await seeders.seedAccountEnvAndUser();
        const prodEnv = await environmentService.createEnvironment(account.id, PROD_ENVIRONMENT_NAME);
        if (!prodEnv) {
            throw new Error('Failed to create prod environment');
        }

        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: PROD_ENVIRONMENT_NAME },
            token: prodEnv.secret_key
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'cannot_delete_prod_environment',
                message: 'Cannot delete prod environment'
            }
        });
    });

    it('should successfully delete a non-prod environment', async () => {
        const { account } = await seeders.seedAccountEnvAndUser();
        const testEnv = await environmentService.createEnvironment(account.id, 'test-delete');
        if (!testEnv) {
            throw new Error('Failed to create test environment');
        }

        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: testEnv.name },
            token: testEnv.secret_key
        });

        expect(res.res.status).toBe(204);

        // Verify the environment was actually deleted
        const deletedEnv = await environmentService.getById(testEnv.id);
        expect(deletedEnv).toBeNull();
    });
});
