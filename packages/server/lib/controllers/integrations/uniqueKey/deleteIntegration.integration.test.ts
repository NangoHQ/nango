import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/integrations/:uniqueKey';

describe(`DELETE ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'DELETE', params: { uniqueKey: 'github' } });

        shouldBeProtected(res);
    });

    it('should delete one', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github', { oauth_client_id: 'foo', oauth_client_secret: 'bar', oauth_scopes: 'hello, world' });

        const res = await api.fetch(endpoint, { method: 'DELETE', token: env.secret_key, params: { uniqueKey: 'github' } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            success: true
        });
    });
});
