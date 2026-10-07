import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../../../seeders/account.seeder.js';
import { createConfigSeed } from '../../../seeders/config.seeder.js';
import { createEnvironmentSeed } from '../../../seeders/environment.seeder.js';
import { getSyncConfigsByConfigIdForWebhook } from './config.service.js';

import type { DBSyncConfig } from '@nangohq/types';

async function insertSyncConfig({
    environmentId,
    nangoConfigId,
    name,
    ...data
}: { environmentId: number; nangoConfigId: number; name: string } & Partial<DBSyncConfig>): Promise<void> {
    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id: environmentId,
        nango_config_id: nangoConfigId,
        sync_name: name,
        type: 'sync',
        file_location: 'file_location',
        version: '0.0.1',
        source: 'repo',
        runs: 'every day',
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: ['*'],
        models: [],
        metadata: {},
        active: true,
        enabled: true,
        deleted: false,
        deleted_at: null,
        ...data
    });
}

describe('getSyncConfigsByConfigIdForWebhook', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('only returns active, enabled, non deleted sync configs with webhook subscriptions', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const integration = await createConfigSeed(environment, 'github', 'github');
        const base = { environmentId: environment.id, nangoConfigId: integration.id! };

        await insertSyncConfig({ ...base, name: 'enabled' });
        await insertSyncConfig({ ...base, name: 'disabled', enabled: false });
        await insertSyncConfig({ ...base, name: 'inactive', active: false });
        await insertSyncConfig({ ...base, name: 'deleted', deleted: true, deleted_at: new Date() });
        await insertSyncConfig({ ...base, name: 'no-subscriptions', webhook_subscriptions: [] });

        const result = await getSyncConfigsByConfigIdForWebhook(environment.id, integration.id!);

        expect(result.map((syncConfig) => syncConfig.sync_name)).toStrictEqual(['enabled']);
    });
});
