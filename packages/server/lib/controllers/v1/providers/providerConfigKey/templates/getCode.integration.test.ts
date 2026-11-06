import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { remoteFileService, seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../../utils/tests.js';

const route = '/api/v1/providers/:providerConfigKey/templates/:name/code';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, params: { providerConfigKey: 'github', name: 'issues' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'GET', token: apiKey.secret, params: { providerConfigKey: 'github', name: 'issues' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('should return the source of a catalog function', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const getFileSpy = vi.spyOn(remoteFileService, 'getFile').mockResolvedValue('sync source');

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev', type: 'sync' },
            params: { providerConfigKey: 'github', name: 'issues' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual({ type: 'sync', code: 'sync source' });
        expect(getFileSpy).toHaveBeenCalledWith('templates-zero/github/syncs/issues.ts');
    });
});
