import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../../../seeders/account.seeder.js';
import { createConfigSeed } from '../../../seeders/config.seeder.js';
import { createConnectionSeed } from '../../../seeders/connection.seeder.js';
import { createEnvironmentSeed } from '../../../seeders/environment.seeder.js';
import { getActionOrModelByEndpoint } from './endpoint.service.js';

import type { DBSyncConfig, DBSyncEndpoint, HTTP_METHOD, IntegrationConfig } from '@nangohq/types';

async function insertSyncConfig({
    environmentId,
    integration,
    name,
    enabled = true,
    endpoints = []
}: {
    environmentId: number;
    integration: IntegrationConfig;
    name: string;
    enabled?: boolean;
    endpoints?: { method: HTTP_METHOD; path: string }[];
}): Promise<void> {
    if (integration.id === undefined) {
        throw new Error('Seeded integration has no id');
    }

    const [row] = await db.knex
        .from<DBSyncConfig>('_nango_sync_configs')
        .insert({
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
        })
        .returning('id');
    if (!row) {
        throw new Error('Sync config not created');
    }

    if (endpoints.length === 0) {
        return;
    }

    await db.knex.from<DBSyncEndpoint>('_nango_sync_endpoints').insert(
        endpoints.map((endpoint) => ({
            method: endpoint.method,
            path: endpoint.path,
            model: null,
            group_name: null,
            sync_config_id: row.id
        }))
    );
}

describe(getActionOrModelByEndpoint, () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('resolves a deployed action by its endpoint', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const integration = await createConfigSeed(environment, 'aircall', 'aircall');
        const connection = await createConnectionSeed({ env: environment, provider: 'aircall' });

        await insertSyncConfig({
            environmentId: environment.id,
            integration,
            name: 'create-contact',
            enabled: false,
            endpoints: [{ method: 'POST', path: '/actions/create-contact' }]
        });

        await expect(getActionOrModelByEndpoint(connection, 'POST', '/actions/create-contact')).resolves.toEqual({ action: 'create-contact' });
    });
});
