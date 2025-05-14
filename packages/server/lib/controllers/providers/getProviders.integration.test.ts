import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { getConnectSessionToken, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

const route = '/providers';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: {} });

        shouldBeProtected(res);
    });

    it('should be authorized by private key', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, { method: 'GET', token: env.secret_key, query: {} });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
    });

    it('should be authorized by connect session token', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const token = await getConnectSessionToken(api, env);
        const res = await api.fetch(route, { method: 'GET', token, query: {} });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
    });

    it('should list all', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            token: env.secret_key,
            query: {}
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject<typeof res.json>({
            data: expect.any(Array)
        });
        expect(res.json.data.length).toBeGreaterThan(200);
    });

    it('should allow search', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            token: env.secret_key,
            query: { search: 'hubspot' }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject<typeof res.json>({
            data: [
                {
                    display_name: 'HubSpot',
                    docs: 'https://docs.nango.dev/integrations/all/hubspot',
                    name: 'hubspot',
                    auth_mode: 'OAUTH2'
                }
            ]
        });
    });

    it('should return empty array when search has no results', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            token: env.secret_key,
            query: { search: 'foobar' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: []
        });
    });
});
