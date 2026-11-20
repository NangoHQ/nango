import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getSyncConfigRaw, remoteFileService, seeders } from '@nangohq/shared';

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

    it('should allow re-enabling a disabled flow', async () => {
        vi.spyOn(remoteFileService, 'copy').mockResolvedValue('_LOCAL_FILE_');
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'airtable-enable', 'airtable');

        const deployRes = await api.fetch(deployEndpoint, {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { providerConfigKey: 'airtable-enable', scriptName: 'tables', type: 'sync' }
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
            token: apiKey.secret,
            body: { provider: 'airtable', providerConfigKey: 'airtable-enable', scriptName: 'tables', type: 'sync' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual({ data: { success: true } });

        const reenabled = await db.knex.from('_nango_sync_configs').where({ id: sync!.id }).first('enabled');
        expect(reenabled?.enabled).toBe(true);
    });
});
