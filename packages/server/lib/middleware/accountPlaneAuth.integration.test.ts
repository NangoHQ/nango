import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { runServer } from '../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

/**
 * One auth path resolves both key planes, so isolation is enforced by the route guards rather than by
 * authentication: an account key presented to an environment route authenticates and is then refused
 * with 403, not 401.
 */
describe('account-plane key isolation', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should refuse an account key on an environment-plane route', async () => {
        const { accountApiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/connection', { method: 'GET', query: {}, token: accountApiKey.secret });

        expect(res.res.status).toBe(403);
        expect(res.json).toMatchObject({ error: { code: 'forbidden' } });
    });

    // Provider metadata is account-agnostic, so this route carries no scope guard and an account key
    // is allowed through.
    it('should allow an account key on the provider catalog, which is not environment data', async () => {
        const { accountApiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/providers', { method: 'GET', query: {}, token: accountApiKey.secret });

        expect(res.res.status).toBe(200);
    });

    /**
     * These two are environment surfaces with no `withScope` guard of their own — `/v1/*` is a catch-all
     * and the control-plane MCP authorizes per tool — so `withEnvironment` is what makes them 403 rather
     * than reaching the handler and hitting the 500 backstop.
     */
    it('should refuse an account key on /v1/* with 403 rather than 500', async () => {
        const { accountApiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/v1/:path', {
            method: 'GET',
            params: { path: 'anything' },
            query: {},
            headers: { 'provider-config-key': 'unused', 'connection-id': 'unused' },
            token: accountApiKey.secret
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toMatchObject({ error: { code: 'forbidden' } });
    });
});
