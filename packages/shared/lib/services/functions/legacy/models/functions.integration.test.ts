import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../../../../seeders/account.seeder.js';
import { createConfigSeed } from '../../../../seeders/config.seeder.js';
import { createEnvironmentSeed } from '../../../../seeders/environment.seeder.js';
import { findIntegrationFunctionCatalog } from './functions.js';

import type { DBSyncConfig, IntegrationConfig, NangoConfigMetadata } from '@nangohq/types';

async function insertSyncConfig({
    environmentId,
    integration,
    name,
    type,
    metadata,
    enabled = true,
    active = true,
    deleted = false
}: {
    environmentId: number;
    integration: IntegrationConfig;
    name: string;
    type: 'sync' | 'action';
    metadata?: NangoConfigMetadata;
    enabled?: boolean;
    active?: boolean;
    deleted?: boolean;
}): Promise<void> {
    if (integration.id === undefined) {
        throw new Error('Seeded integration has no id');
    }

    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id: environmentId,
        nango_config_id: integration.id,
        sync_name: name,
        type,
        file_location: 'file_location',
        version: '0.0.1',
        source: 'repo',
        runs: type === 'sync' ? 'every day' : null,
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        models: [],
        metadata: metadata ?? {},
        active,
        enabled,
        deleted,
        deleted_at: deleted ? new Date() : null
    });
}

describe(findIntegrationFunctionCatalog, () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('returns every integration with its active syncs and actions', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const notion = await createConfigSeed(environment, 'notion', 'notion');
        const github = await createConfigSeed(environment, 'github', 'github');
        await createConfigSeed(environment, 'gmail', 'google');

        await insertSyncConfig({ environmentId: environment.id, integration: notion, name: 'upsert_doc', type: 'action', metadata: { description: 'Upsert' } });
        await insertSyncConfig({ environmentId: environment.id, integration: notion, name: 'sync_pages', type: 'sync' });
        await insertSyncConfig({ environmentId: environment.id, integration: github, name: 'create_issue', type: 'action', enabled: false });

        const catalog = await findIntegrationFunctionCatalog({ environmentId: environment.id });

        expect(catalog).toStrictEqual([
            { integration_id: 'github', provider: 'github', name: 'create_issue', type: 'action', description: null, enabled: false },
            { integration_id: 'gmail', provider: 'google', name: null, type: null, description: null, enabled: null },
            { integration_id: 'notion', provider: 'notion', name: 'sync_pages', type: 'sync', description: null, enabled: true },
            { integration_id: 'notion', provider: 'notion', name: 'upsert_doc', type: 'action', description: 'Upsert', enabled: true }
        ]);
    });

    it('leaves out deleted and superseded function versions', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const notion = await createConfigSeed(environment, 'notion', 'notion');

        await insertSyncConfig({ environmentId: environment.id, integration: notion, name: 'old_version', type: 'action', active: false });
        await insertSyncConfig({ environmentId: environment.id, integration: notion, name: 'removed', type: 'action', deleted: true });
        await insertSyncConfig({ environmentId: environment.id, integration: notion, name: 'kept', type: 'action' });

        const catalog = await findIntegrationFunctionCatalog({ environmentId: environment.id });

        expect(catalog.map((row) => row.name)).toStrictEqual(['kept']);
    });

    it('narrows to the integrations asked for', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const notion = await createConfigSeed(environment, 'notion', 'notion');
        const github = await createConfigSeed(environment, 'github', 'github');

        await insertSyncConfig({ environmentId: environment.id, integration: notion, name: 'upsert_doc', type: 'action' });
        await insertSyncConfig({ environmentId: environment.id, integration: github, name: 'create_issue', type: 'action' });

        const catalog = await findIntegrationFunctionCatalog({ environmentId: environment.id, providerConfigKeys: ['notion'] });

        expect(catalog.map((row) => row.integration_id)).toStrictEqual(['notion']);
    });

    it('does not leak another environment', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const other = await createEnvironmentSeed(account.id);
        const notion = await createConfigSeed(environment, 'notion', 'notion');
        const otherNotion = await createConfigSeed(other, 'notion', 'notion');

        await insertSyncConfig({ environmentId: environment.id, integration: notion, name: 'mine', type: 'action' });
        await insertSyncConfig({ environmentId: other.id, integration: otherNotion, name: 'theirs', type: 'action' });

        const catalog = await findIntegrationFunctionCatalog({ environmentId: environment.id });

        expect(catalog.map((row) => row.name)).toStrictEqual(['mine']);
    });

    it('does not return a function whose environment disagrees with its integration', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const other = await createEnvironmentSeed(account.id);
        const notion = await createConfigSeed(environment, 'notion', 'notion');

        await insertSyncConfig({ environmentId: other.id, integration: notion, name: 'stray', type: 'action' });

        const catalog = await findIntegrationFunctionCatalog({ environmentId: environment.id });

        expect(catalog).toStrictEqual([{ integration_id: 'notion', provider: 'notion', name: null, type: null, description: null, enabled: null }]);
    });
});
