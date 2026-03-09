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
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, { method: 'GET', token: secret.secret, query: {} });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
    });

    it('should be authorized by connect session token', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const token = await getConnectSessionToken(api, secret.secret);
        const res = await api.fetch(route, { method: 'GET', token, query: {} });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
    });

    it('should list all', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            token: secret.secret,
            query: {}
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject<typeof res.json>({
            data: expect.any(Array)
        });
        expect(res.json.data.length).toBeGreaterThan(200);
    });

    it('should allow search', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            token: secret.secret,
            query: { search: 'outreach' }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject<typeof res.json>({
            data: [
                {
                    display_name: 'Outreach',
                    docs: 'https://nango.dev/docs/integrations/all/outreach',
                    logo_url: 'http://localhost:3003/images/template-logos/outreach.svg',
                    name: 'outreach',
                    auth_mode: 'OAUTH2'
                }
            ]
        });
    });

    it('should return multiple results when search matches several providers', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            token: secret.secret,
            query: { search: 'hubspot' }
        });

        isSuccess(res.json);
        expect(res.json.data.length).toBe(2);
        expect(res.json.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    display_name: 'HubSpot',
                    name: 'hubspot',
                    auth_mode: 'OAUTH2'
                }),
                expect.objectContaining({
                    display_name: 'HubSpot (MCP)',
                    name: 'hubspot-mcp',
                    auth_mode: 'MCP_OAUTH2'
                })
            ])
        );
    });

    it('should return empty array when search has no results', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            token: secret.secret,
            query: { search: 'foobar' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: []
        });
    });
});
