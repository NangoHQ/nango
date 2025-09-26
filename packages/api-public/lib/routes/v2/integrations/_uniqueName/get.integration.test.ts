import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer } from '../../../../utils/tests.js';

const method = 'GET';
const endpoint = '/v2/integrations/{uniqueName}/';
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
            },
            params: {
                path: {
                    uniqueName: 'github'
                }
            }
        });
        expect(res.response.status).toBe(401);
    });

    it('should get an error if the integration does not exist', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.client.GET(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                authorization: env.secret_key
            },
            params: {
                path: {
                    uniqueName: 'github'
                }
            }
        });

        isError(res.error);
        expect(res.response.status).toBe(404);
        expect(res.error).toStrictEqual<typeof res.error>({
            error: { code: 'not_found', message: 'Integration "github" does not exist' }
        });
    });

    it('should list one', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.client.GET(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                authorization: env.secret_key
            },
            params: {
                path: {
                    uniqueName: 'github'
                }
            }
        });

        isSuccess(res.data);
        expect(res.response.status).toBe(200);
        expect(res.data).toStrictEqual<typeof res.data>({
            success: true,
            data: {
                createdAt: expect.toBeIsoDate(),
                displayName: 'github',
                logoUrl: 'http://localhost:3003/images/template-logos/github.svg',
                provider: 'github',
                uniqueName: 'github',
                updatedAt: expect.toBeIsoDate()
            }
        });
    });
});
