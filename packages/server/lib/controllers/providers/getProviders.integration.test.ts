import { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

const route = '/providers';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`GET ${route}`, () => {
    beforeAll(async () => {
        await multipleMigrations();
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { search: '' } });

        shouldBeProtected(res);
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
