import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { getFlags } from '@nangohq/feature-flags';
import { seeders } from '@nangohq/shared';

import { authenticateUser, isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const connectionHeaders = { 'connection-id': 'connection-1', 'provider-config-key': 'github' };

describe('Connection MCP', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        api.server.close();
    });

    describe('POST /mcp', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/mcp', { method: 'POST', body: {}, headers: connectionHeaders });
            shouldBeProtected(res);
        });

        it('returns 404 when the flag is off', async () => {
            vi.spyOn(getFlags(), 'isConnectionMcpEnabled').mockResolvedValue(false);
            const { apiKey } = await seeders.seedAccountEnvAndUser();

            const { res, json } = await api.fetch('/mcp', {
                method: 'POST',
                token: apiKey.secret,
                body: {},
                headers: connectionHeaders
            });

            expect(res.status).toBe(404);
            isError(json);
            expect(json.error).toEqual({ code: 'not_found', message: 'Not found' });
        });

        it('returns 404 when the flag is off and the key lacks environment:mcp', async () => {
            vi.spyOn(getFlags(), 'isConnectionMcpEnabled').mockResolvedValue(false);
            const { env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            const created = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'test', scopes: ['environment:deploy'] },
                session
            });
            isSuccess(created.json);

            const { res, json } = await api.fetch('/mcp', {
                method: 'POST',
                token: created.json.data.secret,
                body: {},
                headers: connectionHeaders
            });

            expect(res.status).toBe(404);
            isError(json);
            expect(json.error).toEqual({ code: 'not_found', message: 'Not found' });
        });
    });

    describe('GET /mcp', () => {
        it('returns 405 when the flag is on', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();

            const { res } = await api.fetch('/mcp', { method: 'GET', token: apiKey.secret });

            expect(res.status).toBe(405);
        });

        it('returns 404 when the flag is off', async () => {
            vi.spyOn(getFlags(), 'isConnectionMcpEnabled').mockResolvedValue(false);
            const { apiKey } = await seeders.seedAccountEnvAndUser();

            const { res, json } = await api.fetch('/mcp', { method: 'GET', token: apiKey.secret });

            expect(res.status).toBe(404);
            isError(json);
            expect(json.error).toEqual({ code: 'not_found', message: 'Not found' });
        });
    });
});
