import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getSyncConfigRaw, remoteFileService, seeders, updatePlan } from '@nangohq/shared';

import db from '../../../../../../database/lib/index.js';
import { isSuccess, runServer } from '../../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const deployEndpoint = '/api/v1/flows/pre-built/deploy';

describe('PATCH /api/v1/flows/:id/enable', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should allow re-enabling a flow for non-auto-idling plans with stale expired trial fields', async () => {
        vi.spyOn(remoteFileService, 'copy').mockResolvedValue('_LOCAL_FILE_');
        const { env, plan, secret } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'airtable-enable', 'airtable');
        await updatePlan(db.knex, {
            id: plan.id,
            name: 'starter-v2',
            auto_idle: false,
            trial_start_at: new Date(Date.now() - 2 * 86400 * 1000),
            trial_end_at: new Date(Date.now() - 86400 * 1000),
            trial_end_notified_at: new Date(Date.now() - 12 * 3600 * 1000),
            trial_extension_count: 3,
            trial_expired: true
        });

        const deployRes = await api.fetch(deployEndpoint, {
            method: 'POST',
            query: { env: 'dev' },
            token: secret.secret,
            body: { provider: 'airtable', providerConfigKey: 'airtable-enable', scriptName: 'tables', type: 'sync' }
        });

        isSuccess(deployRes.json);
        expect(deployRes.res.status).toBe(201);

        const sync = await getSyncConfigRaw({ environmentId: env.id, config_id: integration.id!, name: 'tables', isAction: false });
        expect(sync).not.toBeNull();

        await db.knex.from('_nango_sync_configs').where({ id: sync!.id }).update({ enabled: false });

        const res = await api.fetch(`/api/v1/flows/${sync!.id}/enable` as '/api/v1/flows/:id/enable', {
            method: 'PATCH',
            params: { id: sync!.id },
            query: { env: 'dev' },
            token: secret.secret,
            body: { provider: 'airtable', providerConfigKey: 'airtable-enable', scriptName: 'tables', type: 'sync' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual({ data: { success: true } });

        const reenabled = await db.knex.from('_nango_sync_configs').where({ id: sync!.id }).first('enabled');
        expect(reenabled?.enabled).toBe(true);
    });
});
