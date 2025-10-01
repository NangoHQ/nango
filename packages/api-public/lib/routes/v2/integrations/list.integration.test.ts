import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isSuccess, runServer } from '../../../utils/tests.js';

const method = 'GET';
const endpoint = '/v2/integrations/';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`${method} ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(async () => {
        await api.app.close();
    });

    it('should be protected', async () => {
        const res = await api.client.GET(endpoint, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        expect(res.response.status).toBe(401);
    });

    it('should list nothing', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.client.GET(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                authorization: env.secret_key
            }
        });

        isSuccess(res.data);
        expect(res.response.status).toBe(200);
        expect(res.data).toStrictEqual<typeof res.data>({
            success: true,
            data: []
        });
    });

    it('should list one', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.client.GET(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                authorization: env.secret_key
            }
        });

        isSuccess(res.data);
        expect(res.response.status).toBe(200);
        expect(res.data).toStrictEqual<typeof res.data>({
            success: true,
            data: [
                {
                    createdAt: expect.toBeIsoDate(),
                    displayName: 'github',
                    logoUrl: 'http://localhost:3003/images/template-logos/github.svg',
                    provider: 'github',
                    uniqueName: 'github',
                    updatedAt: expect.toBeIsoDate()
                }
            ]
        });
    });
});
