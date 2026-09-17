import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../../../seeders/account.seeder.js';
import { createConfigSeed } from '../../../seeders/config.seeder.js';
import { createConnectionSeed } from '../../../seeders/connection.seeder.js';
import { createEnvironmentSeed } from '../../../seeders/environment.seeder.js';
import { getActionOrModelByEndpoint } from './endpoint.service.js';

import type { DBSyncConfig, IntegrationConfig } from '@nangohq/types';

async function insertSyncConfig({
    environmentId,
    integration,
    name,
    enabled = true
}: {
    environmentId: number;
    integration: IntegrationConfig;
    name: string;
    enabled?: boolean;
}): Promise<void> {
    if (integration.id === undefined) {
        throw new Error('Seeded integration has no id');
    }

    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id: environmentId,
        nango_config_id: integration.id,
        sync_name: name,
        type: 'action',
        file_location: 'file_location',
        version: '0.0.1',
        source: 'repo',
        runs: null,
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        models: [],
        metadata: {},
        active: true,
        enabled,
        deleted: false,
        deleted_at: null
    });
}

describe(getActionOrModelByEndpoint, () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('resolves an enabled live catalog action by endpoint', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        await createConfigSeed(environment, 'aircall', 'aircall', { auto_enable_catalog_actions: true });
        const connection = await createConnectionSeed({ env: environment, provider: 'aircall' });

        await expect(getActionOrModelByEndpoint(connection, 'POST', '/actions/create-contact')).resolves.toEqual({ action: 'create-contact' });
    });

    it('does not fall back to the catalog when an active deployed action occupies the name', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const integration = await createConfigSeed(environment, 'aircall', 'aircall', { auto_enable_catalog_actions: true });
        const connection = await createConnectionSeed({ env: environment, provider: 'aircall' });

        await insertSyncConfig({ environmentId: environment.id, integration, name: 'create-contact', enabled: false });

        await expect(getActionOrModelByEndpoint(connection, 'POST', '/actions/create-contact')).resolves.toEqual({});
    });
});
