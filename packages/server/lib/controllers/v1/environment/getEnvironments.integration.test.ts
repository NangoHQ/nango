import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { secretService, seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

const route = '/api/v1/environments';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET' });

        shouldBeProtected(res);
    });

    it('should return user environments', async () => {
        const { account } = await seeders.seedAccountEnvAndUser();
        const env = await seeders.createEnvironmentSeed(account.id, 'test');
        await seeders.createEnvironmentSeed(account.id, 'prod');

        const secret = (await secretService.getDefaultSecretForEnv(db.knex, env.id)).unwrap();

        const res = await api.fetch(route, {
            method: 'GET',
            token: secret.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [
                {
                    name: 'dev'
                },
                {
                    name: 'prod'
                },
                {
                    name: 'test'
                }
            ]
        });
    });

    it('should not return result from an other account', async () => {
        const { account: account, secret } = await seeders.seedAccountEnvAndUser();
        const { account: account2 } = await seeders.seedAccountEnvAndUser();

        await seeders.createEnvironmentSeed(account.id, 'test');
        await seeders.createEnvironmentSeed(account2.id, 'test1');
        await seeders.createEnvironmentSeed(account2.id, 'test2');

        const res = await api.fetch(route, {
            method: 'GET',
            token: secret.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [
                {
                    name: 'dev'
                },
                {
                    name: 'test'
                }
            ]
        });
    });
});
