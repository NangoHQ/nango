import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { remoteFileService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

const route = '/providers/:provider/templates/:name/code';
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
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'github', name: 'issues' }, query: {} });

        shouldBeProtected(res);
    });

    it('should return the source of a catalog function', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const getFileSpy = vi.spyOn(remoteFileService, 'getFile').mockResolvedValue('sync source');

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { provider: 'github', name: 'issues' }, query: {} });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual({ type: 'sync', code: 'sync source' });
        expect(getFileSpy).toHaveBeenCalledWith('templates-zero/github/syncs/issues.ts');
    });

    it('should read aliased providers from the folder they point to', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const getFileSpy = vi.spyOn(remoteFileService, 'getFile').mockResolvedValue('sync source');

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { provider: 'airtable-pat', name: 'bases' }, query: {} });

        expect(res.res.status).toBe(200);
        expect(getFileSpy).toHaveBeenCalledWith('templates-zero/airtable/syncs/bases.ts');
    });

    it('should reject a name shared by several types', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { provider: 'google-calendar', name: 'settings' }, query: {} });

        expect(res.res.status).toBe(409);
        isError(res.json);
        expect(res.json.error).toMatchObject({
            code: 'ambiguous_function',
            payload: {
                matches: [
                    { type: 'sync', name: 'settings' },
                    { type: 'action', name: 'settings' }
                ]
            }
        });
    });

    it('should use the type to disambiguate', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const getFileSpy = vi.spyOn(remoteFileService, 'getFile').mockResolvedValue('action source');

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { provider: 'google-calendar', name: 'settings' },
            query: { type: 'action' }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual({ type: 'action', code: 'action source' });
        expect(getFileSpy).toHaveBeenCalledWith('templates-zero/google-calendar/actions/settings.ts');
    });

    it('should return unknown_function for a function missing from the catalog', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const getFileSpy = vi.spyOn(remoteFileService, 'getFile');

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { provider: 'github', name: 'not-a-function' }, query: {} });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('unknown_function');
        expect(getFileSpy).not.toHaveBeenCalled();
    });

    it('should return source_unavailable when the source is missing from storage', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        vi.spyOn(remoteFileService, 'getFile').mockRejectedValue(new Error('NoSuchKey'));

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { provider: 'github', name: 'issues' }, query: {} });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('source_unavailable');
    });

    it('should reject invalid function names', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { provider: 'github', name: 'issues.ts' }, query: {} });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_uri_params');
    });
});
