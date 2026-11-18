import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { listCatalogEntries, remoteFileService, seeders } from '@nangohq/shared';

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

    it('returns catalog tool source', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const definition = listCatalogEntries('replicate').find((entry) => entry.type === 'tool');
        if (definition?.type !== 'tool') {
            throw new Error('Expected a catalog tool fixture');
        }
        const getFileSpy = vi.spyOn(remoteFileService, 'getFile').mockResolvedValue('tool source');

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev', type: 'tool' },
            params: { providerConfigKey: definition.provider, name: definition.name }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual({ type: 'tool', code: 'tool source' });
        expect(getFileSpy).toHaveBeenCalledWith(definition.location.ts);
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
