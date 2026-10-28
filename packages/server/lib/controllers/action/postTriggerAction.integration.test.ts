import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/action/trigger';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            body: { action_name: 'test', input: {} },
            headers: { 'provider-config-key': 'test', 'connection-id': 'test' }
        });

        shouldBeProtected(res);
    });

    it('should reject an empty body', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            // @ts-expect-error intentionally omitting required body
            body: {},
            headers: { 'provider-config-key': 'test', 'connection-id': 'test' }
        });

        expect(res.res.status).toBe(400);
        expect(res.json).toMatchObject({ error: { code: 'invalid_body' } });
    });

    it('should accept a body without input', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: { action_name: 'test' },
            headers: { 'provider-config-key': 'test', 'connection-id': 'test' }
        });

        // Passes body validation and fails later because the connection doesn't exist
        expect(res.res.status).toBe(400);
        expect(res.json).toMatchObject({ error: { code: 'unknown_connection' } });
    });
});
