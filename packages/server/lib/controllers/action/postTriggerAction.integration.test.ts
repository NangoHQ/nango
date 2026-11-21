import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { Orchestrator, seeders } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { runServer, shouldBeProtected } from '../../utils/tests.js';

import type { DBSyncConfig } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/action/trigger';
const actionName = 'list-warehouses';

async function seedAction() {
    const seed = await seeders.seedAccountEnvAndUser();
    const integration = await seeders.createConfigSeed(seed.env, 'github', 'github');
    const connection = await seeders.createConnectionSeed({ env: seed.env, provider: integration.unique_key, connectionId: randomUUID() });
    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id: seed.env.id,
        nango_config_id: integration.id!,
        sync_name: actionName,
        type: 'action',
        file_location: 'file_location',
        version: '0.0.1',
        source: 'repo',
        runs: null,
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        models: [],
        input: null,
        metadata: {},
        active: true,
        enabled: true,
        deleted: false,
        deleted_at: null
    });
    return { ...seed, integration, connection };
}

describe(`POST ${endpoint}`, () => {
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

    it('should trigger the action when the body has no input', async () => {
        const seed = await seedAction();
        const triggerAction = vi.spyOn(Orchestrator.prototype, 'triggerAction').mockResolvedValue(Ok({ data: { warehouses: [] } }));

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.apiKey.secret,
            body: { action_name: actionName },
            headers: { 'provider-config-key': seed.integration.unique_key, 'connection-id': seed.connection.connection_id }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual({ warehouses: [] });
        expect(triggerAction).toHaveBeenCalledWith(expect.objectContaining({ actionName, input: undefined }));
    });
});
