import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { flags } from '@nangohq/utils';

import { createAccount } from '../../../seeders/account.seeder.js';
import { createConfigSeed } from '../../../seeders/config.seeder.js';
import { createEnvironmentSeed } from '../../../seeders/environment.seeder.js';
import { getFunction, listActions, listFunctions } from './service.js';

import type { DBEnvironment, DBSyncConfig, IntegrationConfig } from '@nangohq/types';

const { mockListCatalogTools, mockGetCatalogTool } = vi.hoisted(() => {
    return { mockListCatalogTools: vi.fn(), mockGetCatalogTool: vi.fn() };
});

vi.mock('../../catalog/actions.js', () => ({
    listCatalogTools: mockListCatalogTools,
    getCatalogTool: mockGetCatalogTool
}));

function catalogTool(name: string) {
    return {
        name,
        description: `${name} description`,
        scopes: [],
        input: null,
        output: [],
        jsonSchema: null,
        sdkVersion: '0.0.0-zero',
        version: '0.0.1',
        fileLocation: `templates-zero/github/build/github_actions_${name}.cjs`,
        sourceLocation: `templates-zero/github/actions/${name}.ts`,
        capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
        module: 'action' as const
    };
}

async function insertSyncConfig({
    environmentId,
    integration,
    name,
    type
}: {
    environmentId: number;
    integration: IntegrationConfig;
    name: string;
    type: 'sync' | 'action';
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
        metadata: {},
        active: true,
        enabled: true,
        deleted: false,
        deleted_at: null
    });
}

async function seedIntegration() {
    const account = await createAccount();
    const environment = await createEnvironmentSeed(account.id);
    const integration = await createConfigSeed(environment, 'github', 'github');
    return { environment, integration };
}

async function listPage({
    environment,
    offset,
    limit
}: {
    environment: DBEnvironment;
    offset: number;
    limit: number;
}): Promise<{ rows: { name: string; source: string; enabled: boolean; id: number | null }[]; total: number }> {
    const result = await listFunctions({
        environmentId: environment.id,
        providerConfigKey: 'github',
        type: undefined,
        search: undefined,
        limit,
        offset
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
        throw result.error;
    }
    return {
        rows: result.value.rows.map((row) => ({ name: row.name, source: row.source, enabled: row.enabled, id: row.id })),
        total: result.value.total
    };
}

describe('listFunctions with catalog actions', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    beforeEach(() => {
        mockListCatalogTools.mockReturnValue([]);
        mockGetCatalogTool.mockReturnValue(undefined);
    });

    it('returns consecutive pages of the merged order without gaps or repeats', async () => {
        const { environment, integration } = await seedIntegration();
        mockListCatalogTools.mockReturnValue([catalogTool('a'), catalogTool('b'), catalogTool('c')]);
        await insertSyncConfig({ environmentId: environment.id, integration, name: 'm', type: 'action' });
        await insertSyncConfig({ environmentId: environment.id, integration, name: 'n', type: 'action' });
        await insertSyncConfig({ environmentId: environment.id, integration, name: 'o', type: 'action' });

        const page1 = await listPage({ environment, offset: 0, limit: 2 });
        const page2 = await listPage({ environment, offset: 2, limit: 2 });
        const page3 = await listPage({ environment, offset: 4, limit: 2 });

        expect(page1.total).toBe(6);
        expect(page2.total).toBe(6);
        expect(page3.total).toBe(6);
        expect(page1.rows).toEqual([
            { name: 'a', source: 'tools-catalog', enabled: true, id: null },
            { name: 'b', source: 'tools-catalog', enabled: true, id: null }
        ]);
        expect(page2.rows).toEqual([
            { name: 'c', source: 'tools-catalog', enabled: true, id: null },
            { name: 'm', source: 'repo', enabled: true, id: expect.any(Number) }
        ]);
        expect(page3.rows).toEqual([
            { name: 'n', source: 'repo', enabled: true, id: expect.any(Number) },
            { name: 'o', source: 'repo', enabled: true, id: expect.any(Number) }
        ]);
    });

    it('interleaves catalog actions with deployed actions by name', async () => {
        const { environment, integration } = await seedIntegration();
        mockListCatalogTools.mockReturnValue([catalogTool('delete'), catalogTool('list')]);
        await insertSyncConfig({ environmentId: environment.id, integration, name: 'create', type: 'action' });
        await insertSyncConfig({ environmentId: environment.id, integration, name: 'update', type: 'action' });

        const page1 = await listPage({ environment, offset: 0, limit: 2 });
        const page2 = await listPage({ environment, offset: 2, limit: 2 });

        expect(page1.rows).toEqual([
            { name: 'create', source: 'repo', enabled: true, id: expect.any(Number) },
            { name: 'delete', source: 'tools-catalog', enabled: true, id: null }
        ]);
        expect(page2.rows).toEqual([
            { name: 'list', source: 'tools-catalog', enabled: true, id: null },
            { name: 'update', source: 'repo', enabled: true, id: expect.any(Number) }
        ]);
    });

    it('does not list a catalog action that already has a deployed row', async () => {
        const { environment, integration } = await seedIntegration();
        mockListCatalogTools.mockReturnValue([catalogTool('create-issue')]);
        await insertSyncConfig({ environmentId: environment.id, integration, name: 'create-issue', type: 'action' });

        const page = await listPage({ environment, offset: 0, limit: 20 });

        expect(page.total).toBe(1);
        expect(page.rows).toEqual([{ name: 'create-issue', source: 'repo', enabled: true, id: expect.any(Number) }]);
    });

    it('does not occupy a catalog name with a deployed action from another environment', async () => {
        const { environment, integration } = await seedIntegration();
        const other = await createEnvironmentSeed(environment.account_id);
        mockListCatalogTools.mockReturnValue([catalogTool('create-issue')]);
        await insertSyncConfig({ environmentId: other.id, integration, name: 'create-issue', type: 'action' });

        const page = await listPage({ environment, offset: 0, limit: 20 });

        expect(page.total).toBe(1);
        expect(page.rows).toEqual([{ name: 'create-issue', source: 'tools-catalog', enabled: true, id: null }]);
    });

    it('attaches catalog json_schema after listing', async () => {
        const { environment } = await seedIntegration();
        const jsonSchema = { type: 'object', properties: { title: { type: 'string' } } };
        mockListCatalogTools.mockReturnValue([{ ...catalogTool('create-issue'), jsonSchema }]);

        const result = await listFunctions({
            environmentId: environment.id,
            providerConfigKey: 'github',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value.rows[0]).toMatchObject({ name: 'create-issue', source: 'tools-catalog', json_schema: jsonSchema });
    });

    it('lists actions for connection tools using the merged deployed and catalog view', async () => {
        const { environment, integration } = await seedIntegration();
        mockListCatalogTools.mockReturnValue([catalogTool('create-issue'), catalogTool('delete-issue')]);
        await insertSyncConfig({ environmentId: environment.id, integration, name: 'delete-issue', type: 'action' });

        const result = await listActions({ environmentId: environment.id, providerConfigKey: 'github' });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value.map((action) => ({ name: action.name, source: action.source, enabled: action.enabled }))).toEqual([
            { name: 'create-issue', source: 'tools-catalog', enabled: true },
            { name: 'delete-issue', source: 'repo', enabled: true }
        ]);
    });

    it('applies the requested action list limit', async () => {
        const { environment } = await seedIntegration();
        mockListCatalogTools.mockReturnValue([catalogTool('create-issue'), catalogTool('delete-issue')]);

        const result = await listActions({ environmentId: environment.id, providerConfigKey: 'github', limit: 1 });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value.map((action) => action.name)).toEqual(['create-issue']);
    });
});

describe('getFunction with catalog actions', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    beforeEach(() => {
        mockListCatalogTools.mockReturnValue([]);
        mockGetCatalogTool.mockReturnValue(undefined);
    });

    it('returns a catalog action when no deployed row exists', async () => {
        const { environment } = await seedIntegration();
        mockListCatalogTools.mockReturnValue([catalogTool('create-issue')]);

        const result = await getFunction({
            environmentId: environment.id,
            providerConfigKey: 'github',
            name: 'create-issue',
            type: 'action'
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toMatchObject({
            name: 'create-issue',
            type: 'action',
            id: null,
            last_deployed: null,
            source: 'tools-catalog',
            enabled: true
        });
    });

    it('returns the deployed row when the same catalog name exists', async () => {
        const { environment, integration } = await seedIntegration();
        mockListCatalogTools.mockReturnValue([catalogTool('create-issue')]);
        await insertSyncConfig({ environmentId: environment.id, integration, name: 'create-issue', type: 'action' });

        const result = await getFunction({
            environmentId: environment.id,
            providerConfigKey: 'github',
            name: 'create-issue',
            type: 'action'
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toMatchObject({
            name: 'create-issue',
            source: 'repo',
            enabled: true,
            id: expect.any(Number)
        });
    });

    it('does not return a catalog action when FLAG_CATALOG_TOOLS_ENABLED is off', async () => {
        const original = flags.hasCatalogTools;
        flags.hasCatalogTools = false;
        try {
            const { environment } = await seedIntegration();
            mockListCatalogTools.mockReturnValue([catalogTool('create-issue')]);

            const result = await getFunction({
                environmentId: environment.id,
                providerConfigKey: 'github',
                name: 'create-issue',
                type: 'action'
            });

            expect(result.isOk()).toBe(true);
            if (result.isErr()) {
                return;
            }
            expect(result.value).toBeUndefined();
        } finally {
            flags.hasCatalogTools = original;
        }
    });
});
