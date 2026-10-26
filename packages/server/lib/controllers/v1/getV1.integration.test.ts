import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { getFlags } from '@nangohq/feature-flags';
import { seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/v1/:path';
const params = { path: 'some/path' };
const headers = { 'connection-id': 'connection-1', 'provider-config-key': 'github' };

describe(`ALL ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'GET', params, headers });
        shouldBeProtected(res);
    });

    it('returns 404 when the account is not allowlisted', async () => {
        vi.spyOn(getFlags(), 'isV1PassthroughEnabled').mockResolvedValue(false);
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params,
            headers
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error).toEqual({ code: 'feature_disabled' });
    });

    it('reaches the passthrough handler when the account is allowlisted', async () => {
        vi.spyOn(getFlags(), 'isV1PassthroughEnabled').mockResolvedValue(true);
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params,
            headers
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error).toEqual({ code: 'unknown_connection', message: 'Failed to find connection' });
    });
});
