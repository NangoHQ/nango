import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { audit } from '@nangohq/audit';
import * as featureFlags from '@nangohq/feature-flags';
import { seeders } from '@nangohq/shared';

import { isSuccess, runServer } from '../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: ReturnType<typeof vi.spyOn<typeof audit, 'record'>>;
let flagSpy: ReturnType<typeof vi.spyOn<ReturnType<typeof featureFlags.getFlags>, 'isAuditLoggingEnabled'>>;

// Sets up an account + env + a connection under provider_config_key 'algolia'.
async function seedConnection() {
    const seed = await seeders.seedAccountEnvAndUser();
    await seeders.createConfigSeed(seed.env, 'algolia', 'algolia');
    const connection = await seeders.createConnectionSeed({
        env: seed.env,
        provider: 'algolia',
        rawCredentials: { type: 'API_KEY', apiKey: 'test_api_key' }
    });
    return { ...seed, connection };
}

describe('audit middleware (public API)', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record');
        // getFlags() returns the stable noop facade in tests; force audit-logging on.
        flagSpy = vi.spyOn(featureFlags.getFlags(), 'isAuditLoggingEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        auditSpy.mockClear();
    });

    it('audit log for a deleted connection', async () => {
        const { account, env, apiKey, connection } = await seedConnection();

        const res = await api.fetch('/connection/:connectionId', {
            method: 'DELETE',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { provider_config_key: 'algolia' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'connection',
            action: 'deleted',
            outcome: 'success',
            accountId: account.id,
            environmentId: env.id,
            actor: { type: 'api_key' },
            targets: [{ type: 'connection', id: connection.connection_id }]
        });
    });

    it('does not record when audit logging is disabled for the account', async () => {
        const { apiKey, connection } = await seedConnection();
        flagSpy.mockResolvedValueOnce(false);

        const res = await api.fetch('/connection/:connectionId', {
            method: 'DELETE',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { provider_config_key: 'algolia' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        // Let the fire-and-forget finish hook run, then confirm the gate short-circuited it.
        await new Promise((resolve) => setImmediate(resolve));
        expect(auditSpy).not.toHaveBeenCalled();
    });
});
