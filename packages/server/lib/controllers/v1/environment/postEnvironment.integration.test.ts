import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { environmentService, seeders, updatePlan } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/environments';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            body: { name: 'test' }
        });

        shouldBeProtected(res);
    });

    it('should not allow environment name to be the same as an existing environment', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, environments_max: 10 });
        await environmentService.createEnvironment(env.account_id, 'existing');

        const res = await api.fetch(endpoint, {
            method: 'POST',
            body: { name: 'existing' },
            token: env.secret_key
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'conflict',
                message: 'Environment already exists'
            }
        });
    });

    it('should limit the number of environments based on environments_max flag', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, environments_max: 1 });

        const res = await api.fetch(endpoint, {
            method: 'POST',
            body: { name: 'dev' },
            token: env.secret_key
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'resource_capped',
                message: 'Maximum number of environments reached'
            }
        });
    });

    // Does not work because we only have env secret key for authentication but we actually want to create an env
    // it('should create an environment', async () => {
    //     const { account } = await seeders.seedAccountEnvAndUser();

    //     const res = await api.fetch(endpoint, {
    //         method: 'POST',
    //         body: { name: 'test', accountId: account.id }
    //     });

    //     isSuccess(res.json);
    //     expect(res.json).toStrictEqual<typeof res.json>({
    //         data: { id: expect.any(Number), name: 'test' }
    //     });
    // });
});
