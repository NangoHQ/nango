import { randomUUID } from 'node:crypto';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../../../seeders/account.seeder.js';
import { createConfigSeed } from '../../../seeders/config.seeder.js';
import { createEnvironmentSeed } from '../../../seeders/environment.seeder.js';
import { listCatalogEntries } from '../../catalog/actions.js';
import * as functionConfigService from '../models/functions.js';
import { getFunction, listActions, listFunctions } from './service.js';

import type { DBEnvironment, DBFunctionConfigVersion, DBSyncConfig, IntegrationConfig } from '@nangohq/types';

const { mockHasCatalogTools } = vi.hoisted(() => {
    return { mockHasCatalogTools: vi.fn() };
});

vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({ hasCatalogTools: mockHasCatalogTools })
}));

const anyId: unknown = expect.any(Number);

beforeEach(() => {
    mockHasCatalogTools.mockResolvedValue(true);
});

async function insertSyncConfig({
    environmentId,
    integration,
    name,
    type,
    enabled = true
}: {
    environmentId: number;
    integration: IntegrationConfig;
    name: string;
    type: 'sync' | 'action';
    enabled?: boolean;
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
        enabled,
        deleted: false,
        deleted_at: null
    });
}

async function seedIntegration(provider = 'github', providerConfigKey = provider) {
    const account = await createAccount();
    const environment = await createEnvironmentSeed(account.id);
    const integration = await createConfigSeed(environment, providerConfigKey, provider);
    return { account, environment, integration };
}

function catalogTool() {
    const definition = listCatalogEntries('replicate').find((entry) => entry.type === 'tool');
    if (definition?.type !== 'tool') {
        throw new Error('Expected a catalog tool fixture');
    }
    return definition;
}

function catalogAction() {
    const definition = listCatalogEntries('github').find((entry) => entry.type === 'action');
    if (!definition) {
        throw new Error('Expected a catalog action fixture');
    }
    return definition;
}

async function listPage({
    environment,
    providerConfigKey = 'github',
    offset,
    limit
}: {
    environment: DBEnvironment;
    providerConfigKey?: string;
    offset: number;
    limit: number;
}): Promise<{ rows: { name: string; source: string; enabled: boolean; id: number | null }[]; total: number }> {
    const result = await listFunctions({
        environmentId: environment.id,
        providerConfigKey,
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

describe('listFunctions with HTTP-triggered tools', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('combines storage models before counting and paging, and scopes tools to their integration and environment', async () => {
        mockHasCatalogTools.mockResolvedValue(false);
        const { environment, integration } = await seedIntegration();
        await insertSyncConfig({ environmentId: environment.id, integration, name: 'legacy', type: 'action' });
        const version: Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'> = {
            description: 'Fetch users',
            tags: { instructions: 'Read users', required_scopes: { all: ['read'] }, category: 'crm' },
            file_location: 'functions/fetch-users',
            version: 'test',
            source: 'repo',
            trigger: { kind: 'http' },
            requires: { connection: true, outbound: false, invoke: false },
            capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
            limits: { concurrency: { perConnection: 'max' } },
            input_schema_ref: '#/definitions/Input',
            output_schema_ref: null,
            model_schema_refs: [],
            metadata_schema_ref: null,
            checkpoint_schema_ref: null,
            json_schema: { definitions: { Input: { type: 'string' } } }
        };
        const configs = (
            await functionConfigService.upsert(db.knex, [
                { environmentId: environment.id, integrationId: 'github', name: 'fetch-users', version },
                { environmentId: environment.id, integrationId: 'github', name: 'disabled', version },
                { environmentId: environment.id, integrationId: 'github', name: 'deleted', version },
                {
                    environmentId: environment.id,
                    integrationId: 'github',
                    name: 'schedule',
                    version: { ...version, trigger: { kind: 'schedule', frequency: 'every day' } }
                }
            ])
        ).unwrap();
        const [tool, disabled, deleted] = configs;
        if (!tool || !disabled || !deleted) {
            throw new Error('Expected seeded tool functions');
        }
        await db.knex('function_configs').where({ id: disabled.config.id }).update({ enabled: false });
        await db.knex('function_configs').where({ id: deleted.config.id }).update({ deleted_at: new Date() });
        await createConfigSeed(environment, 'other', 'github');
        const other = await seedIntegration();
        (
            await functionConfigService.upsert(db.knex, [
                { environmentId: environment.id, integrationId: 'other', name: 'wrong-integration', version },
                { environmentId: other.environment.id, integrationId: 'github', name: 'wrong-environment', version }
            ])
        ).unwrap();

        const page = await listPage({ environment, offset: 1, limit: 1 });
        expect(page.total).toBe(3);
        expect(page.rows).toEqual([expect.objectContaining({ name: 'fetch-users', source: 'repo' })]);

        const filtered = (
            await listFunctions({ environmentId: environment.id, providerConfigKey: 'github', type: 'tool', search: 'fetch-', limit: 20, offset: 0 })
        ).unwrap();
        expect(filtered.total).toBe(1);
        expect(filtered.rows).toEqual([
            expect.objectContaining({
                type: 'tool',
                id: null,
                uuid: tool.config.uuid,
                name: 'fetch-users',
                integration_id: 'github',
                provider: 'github',
                input_json_schema: { $ref: '#/definitions/Input', definitions: { Input: { type: 'string' } } },
                output_json_schema: null,
                meta: { instructions: 'Read users', required_scopes: { all: ['read'] }, tags: { category: 'crm' } }
            })
        ]);
    });
});

describe('listFunctions with catalog entries', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('paginates catalog tools and actions', async () => {
        const { environment, integration } = await seedIntegration('replicate', 'custom-replicate');
        const catalog = listCatalogEntries('replicate').filter((entry) => entry.type === 'tool' || entry.type === 'action');
        expect(catalog.some((entry) => entry.type === 'tool')).toBe(true);
        const prefix = randomUUID().slice(0, 8);
        const names = ['a', 'b', 'c'].map((suffix) => `test-${prefix}-${suffix}`);
        for (const name of names) {
            await insertSyncConfig({ environmentId: environment.id, integration, name, type: 'action' });
        }
        const actionNames = [...catalog.filter((entry) => entry.type === 'action').map(({ name }) => name), ...names].sort();
        const expected = [
            ...catalog
                .filter((entry) => entry.type === 'tool')
                .map(({ name }) => name)
                .sort()
                .map((name) => ({ name, source: 'tools-catalog', enabled: true, id: null })),
            ...actionNames.map((name) => ({
                name,
                source: names.includes(name) ? 'repo' : 'tools-catalog',
                enabled: true,
                id: names.includes(name) ? anyId : null
            }))
        ];

        const pages = await Promise.all(
            Array.from({ length: Math.ceil(expected.length / 2) }, (_, index) =>
                listPage({ environment, providerConfigKey: integration.unique_key, offset: index * 2, limit: 2 })
            )
        );

        expect(pages.map(({ total }) => total)).toEqual(pages.map(() => expected.length));
        expect(pages.flatMap(({ rows }) => rows)).toEqual(expected);
    });

    it('orders catalog and deployed actions by name', async () => {
        const { environment, integration } = await seedIntegration();
        const catalog = listCatalogEntries('github').filter((entry) => entry.type === 'action');
        expect(catalog.length).toBeGreaterThan(0);
        const prefix = randomUUID().slice(0, 8);
        const names = ['create', 'update'].map((suffix) => `test-${prefix}-${suffix}`);
        for (const name of names) {
            await insertSyncConfig({ environmentId: environment.id, integration, name, type: 'action' });
        }
        const expectedNames = [...catalog.map(({ name }) => name), ...names].sort();

        const result = (
            await listFunctions({
                environmentId: environment.id,
                providerConfigKey: integration.unique_key,
                type: 'action',
                search: undefined,
                limit: expectedNames.length,
                offset: 0
            })
        ).unwrap();

        expect(result.total).toBe(expectedNames.length);
        expect(result.rows.map(({ name, source }) => ({ name, source }))).toEqual(
            expectedNames.map((name) => ({ name, source: names.includes(name) ? 'repo' : 'tools-catalog' }))
        );
    });

    it('enables legacy actions but not syncs', async () => {
        const { environment, integration } = await seedIntegration('replicate');
        const definition = catalogTool();
        const syncName = `test-${randomUUID().slice(0, 8)}-sync`;
        await insertSyncConfig({ environmentId: environment.id, integration, name: definition.name, type: 'action', enabled: false });
        await insertSyncConfig({ environmentId: environment.id, integration, name: syncName, type: 'sync', enabled: false });
        const limit = listCatalogEntries('replicate').length + 2;

        const page = await listPage({ environment, providerConfigKey: integration.unique_key, offset: 0, limit });

        expect(page.rows.filter(({ source }) => source === 'repo')).toEqual([
            { name: definition.name, source: 'repo', enabled: true, id: anyId },
            { name: syncName, source: 'repo', enabled: false, id: anyId }
        ]);
    });

    it('keeps a disabled deployed action disabled when tools-catalog is off', async () => {
        mockHasCatalogTools.mockResolvedValue(false);
        const { environment, integration } = await seedIntegration();
        await insertSyncConfig({ environmentId: environment.id, integration, name: 'create-issue', type: 'action', enabled: false });

        const page = await listPage({ environment, offset: 0, limit: 20 });

        expect(page.rows).toEqual([{ name: 'create-issue', source: 'repo', enabled: false, id: anyId }]);
    });

    it('shadows catalog actions with deployed actions', async () => {
        const { environment, integration } = await seedIntegration();
        const definition = catalogAction();
        const catalog = listCatalogEntries('github').filter((entry) => entry.type === 'action');
        await insertSyncConfig({ environmentId: environment.id, integration, name: definition.name, type: 'action' });

        const page = (
            await listFunctions({
                environmentId: environment.id,
                providerConfigKey: integration.unique_key,
                type: 'action',
                search: undefined,
                limit: catalog.length,
                offset: 0
            })
        ).unwrap();

        expect(page.total).toBe(catalog.length);
        expect(page.rows.filter(({ name }) => name === definition.name)).toEqual([
            expect.objectContaining({ name: definition.name, source: 'repo', enabled: true, id: anyId })
        ]);
    });

    it('prefers deployed tools, including disabled ones', async () => {
        const { environment, integration } = await seedIntegration('replicate');
        const catalog = listCatalogEntries('replicate').filter((entry) => entry.type === 'tool' || entry.type === 'action');
        const definition = catalogTool();
        const prefix = randomUUID().slice(0, 8);
        const actionName = `test-${prefix}-action`;
        const syncName = `test-${prefix}-sync`;
        for (const name of [definition.name, actionName]) {
            await insertSyncConfig({ environmentId: environment.id, integration, name, type: 'action' });
        }
        await insertSyncConfig({ environmentId: environment.id, integration, name: syncName, type: 'sync' });
        const names = [definition.name, syncName];
        const tools = (
            await functionConfigService.upsert(
                db.knex,
                names.map((name) => ({
                    environmentId: environment.id,
                    integrationId: integration.unique_key,
                    name,
                    version: {
                        description: name,
                        tags: {},
                        file_location: `functions/${name}`,
                        version: 'test',
                        source: 'repo' as const,
                        trigger: { kind: 'http' as const },
                        requires: { connection: true, outbound: false, invoke: false },
                        capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
                        limits: { concurrency: { perConnection: 'max' as const } },
                        input_schema_ref: null,
                        output_schema_ref: null,
                        model_schema_refs: [],
                        metadata_schema_ref: null,
                        checkpoint_schema_ref: null,
                        json_schema: {}
                    }
                }))
            )
        ).unwrap();
        const tool = tools[0];
        if (!tool) {
            throw new Error('Expected a deployed tool fixture');
        }
        await db.knex('function_configs').where({ id: tool.config.id }).update({ enabled: false });
        const expectedTools = [...new Set([...catalog.filter((entry) => entry.type === 'tool').map(({ name }) => name), ...names])]
            .sort()
            .map((name) => ({ name, type: 'tool' }));
        const actionNames = [...catalog.filter((entry) => entry.type === 'action').map(({ name }) => name), actionName].sort();
        const expectedActions = actionNames.map((name) => ({ name, type: 'action' }));
        const scope = { environmentId: environment.id, providerConfigKey: integration.unique_key };
        const limit = expectedTools.length + expectedActions.length + 1;

        const untyped = (await listFunctions({ ...scope, type: undefined, search: undefined, limit, offset: 0 })).unwrap();
        expect(untyped.rows.map(({ name, type }) => ({ name, type }))).toEqual([...expectedTools, ...expectedActions, { name: syncName, type: 'sync' }]);

        const actions = (await listFunctions({ ...scope, type: 'action', search: undefined, limit, offset: 0 })).unwrap();
        expect(actions.total).toBe(expectedActions.length);
        expect(actions.rows.map(({ name, type }) => ({ name, type }))).toEqual(expectedActions);
        expect(actions.rows.find(({ name }) => name === actionName)).toMatchObject({ source: 'repo' });

        const toolsListing = (await listFunctions({ ...scope, type: 'tool', search: undefined, limit, offset: 0 })).unwrap();
        expect(toolsListing.total).toBe(expectedTools.length + expectedActions.length);
        expect(toolsListing.rows.map(({ name, type }) => ({ name, type }))).toEqual([...expectedTools, ...expectedActions]);

        const listed = (await listActions(scope)).unwrap();
        expect(listed.actions.map((action) => action.name)).toEqual(actionNames);

        const selected = (await getFunction({ ...scope, name: definition.name, type: undefined })).unwrap();
        expect(selected).toMatchObject({ name: definition.name, type: 'tool', source: 'repo', enabled: false });
        const selectedTool = (await getFunction({ ...scope, name: definition.name, type: 'tool' })).unwrap();
        expect(selectedTool).toMatchObject({ type: 'tool', source: 'repo', enabled: false });
        expect((await getFunction({ ...scope, name: definition.name, type: 'action' })).unwrap()).toBeUndefined();
        const sync = (await getFunction({ ...scope, name: syncName, type: undefined })).unwrap();
        expect(sync).toMatchObject({ name: syncName, type: 'tool' });
    });

    it('ignores actions from another environment', async () => {
        const { environment, integration } = await seedIntegration('replicate');
        const other = await createEnvironmentSeed(environment.account_id);
        const definition = catalogTool();
        const catalog = listCatalogEntries('replicate').filter((entry) => entry.type === 'tool' || entry.type === 'action');
        await insertSyncConfig({ environmentId: other.id, integration, name: definition.name, type: 'action' });

        const page = await listPage({ environment, providerConfigKey: integration.unique_key, offset: 0, limit: catalog.length });

        expect(page.total).toBe(catalog.length);
        expect(page.rows.filter(({ name }) => name === definition.name)).toEqual([{ name: definition.name, source: 'tools-catalog', enabled: true, id: null }]);
    });

    it('attaches catalog action schemas', async () => {
        const { environment } = await seedIntegration();
        const catalog = listCatalogEntries('github').filter((entry) => entry.type === 'action');
        expect(catalog.length).toBeGreaterThan(0);

        const result = (
            await listFunctions({
                environmentId: environment.id,
                providerConfigKey: 'github',
                type: 'action',
                search: undefined,
                limit: catalog.length,
                offset: 0
            })
        ).unwrap();

        for (const definition of catalog) {
            expect(result.rows.find(({ name }) => name === definition.name)).toMatchObject({
                name: definition.name,
                source: 'tools-catalog',
                json_schema: definition.jsonSchema
            });
        }
    });

    it('merges deployed and catalog actions', async () => {
        const { environment, integration } = await seedIntegration();
        const definition = catalogAction();
        const names = listCatalogEntries('github')
            .filter((entry) => entry.type === 'action')
            .map(({ name }) => name)
            .sort();
        await insertSyncConfig({ environmentId: environment.id, integration, name: definition.name, type: 'action' });

        const result = (await listActions({ environmentId: environment.id, providerConfigKey: integration.unique_key })).unwrap();

        expect(result.provider).toBe('github');
        expect(result.actions.map(({ name, source, enabled }) => ({ name, source, enabled }))).toEqual(
            names.map((name) => ({ name, source: name === definition.name ? 'repo' : 'tools-catalog', enabled: true }))
        );
    });

    it('lists every action without capping the count', async () => {
        const { environment, integration } = await seedIntegration();
        const prefix = randomUUID().slice(0, 8);
        const names = Array.from({ length: 250 }, (_, i) => `test-${prefix}-${String(i).padStart(3, '0')}`);
        const catalogNames = listCatalogEntries('github')
            .filter((entry) => entry.type === 'action')
            .map(({ name }) => name);
        await Promise.all(names.map((name) => insertSyncConfig({ environmentId: environment.id, integration, name, type: 'action' })));

        const result = (await listActions({ environmentId: environment.id, providerConfigKey: integration.unique_key })).unwrap();

        expect(result.actions.map(({ name }) => name)).toEqual([...names, ...catalogNames].sort());
    });
});

describe('getFunction with catalog actions', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it.each(['action', 'tool'] as const)('returns a catalog action when no deployed row exists with type=%s', async (type) => {
        const { environment } = await seedIntegration();
        const definition = catalogAction();

        const result = await getFunction({
            environmentId: environment.id,
            providerConfigKey: 'github',
            name: definition.name,
            type
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toMatchObject({
            name: definition.name,
            type: 'action',
            id: null,
            last_deployed: null,
            source: 'tools-catalog',
            enabled: true
        });
    });

    it.each(['action', 'tool'] as const)('returns the deployed row when the same catalog name exists with type=%s', async (type) => {
        const { environment, integration } = await seedIntegration();
        const definition = catalogAction();
        await insertSyncConfig({ environmentId: environment.id, integration, name: definition.name, type: 'action' });

        const result = await getFunction({
            environmentId: environment.id,
            providerConfigKey: 'github',
            name: definition.name,
            type
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toMatchObject({
            name: definition.name,
            source: 'repo',
            enabled: true,
            id: anyId
        });
    });

    it.each(['action', 'tool'] as const)('does not return a catalog action when tools-catalog is off with type=%s', async (type) => {
        mockHasCatalogTools.mockResolvedValue(false);
        const { environment } = await seedIntegration();
        const definition = catalogAction();

        const result = await getFunction({
            environmentId: environment.id,
            providerConfigKey: 'github',
            name: definition.name,
            type
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toBeUndefined();
    });
});

describe('listFunctions with catalog tools', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('lists a catalog tool', async () => {
        const { environment, integration } = await seedIntegration('replicate', 'custom-replicate');
        const definition = catalogTool();
        const catalog = listCatalogEntries('replicate').filter((entry) => entry.type === 'tool' || entry.type === 'action');
        const matches = catalog.filter(({ name }) => name.toLowerCase().includes(definition.name.toLowerCase()));

        const result = (
            await listFunctions({
                environmentId: environment.id,
                providerConfigKey: integration.unique_key,
                type: 'tool',
                search: definition.name,
                limit: catalog.length,
                offset: 0
            })
        ).unwrap();

        expect(result.total).toBe(matches.length);
        const fn = result.rows.find(({ name }) => name === definition.name);
        if (fn?.type !== 'tool') {
            throw new Error('Expected listed catalog tool');
        }
        expect(fn).toMatchObject({
            type: 'tool',
            id: null,
            uuid: definition.uuid,
            name: definition.name,
            description: definition.description,
            integration_id: integration.unique_key,
            provider: definition.provider,
            enabled: true,
            last_deployed: null,
            source: 'tools-catalog'
        });
        const { instructions, required_scopes, ...tags } = definition.tags ?? {};
        expect(fn.meta.tags).toEqual(tags);
        expect(fn.meta.instructions).toEqual(instructions);
        expect(fn.meta.required_scopes).toEqual(required_scopes);
        for (const [ref, schema] of [
            [definition.input_schema_ref, fn.input_json_schema],
            [definition.output_schema_ref, fn.output_json_schema]
        ] as const) {
            if (ref === null) {
                expect(schema).toBeNull();
                continue;
            }
            const model = ref.slice('#/definitions/'.length);
            expect(schema?.$ref).toBe(ref);
            expect(Object.hasOwn(schema?.definitions ?? {}, model)).toBe(true);
            expect(schema?.definitions?.[model]).toEqual(definition.json_schema.definitions?.[model]);
        }
    });

    it.each([true, false])('catalog tool discovery respects the flag: %s', async (enabled) => {
        mockHasCatalogTools.mockResolvedValue(enabled);
        const { environment, integration } = await seedIntegration('replicate', 'custom-replicate');
        const definition = catalogTool();
        const catalog = listCatalogEntries('replicate').filter((entry) => entry.type === 'tool' || entry.type === 'action');
        const scope = { environmentId: environment.id, providerConfigKey: integration.unique_key };

        for (const type of [undefined, 'tool'] as const) {
            const fn = (await getFunction({ ...scope, name: definition.name, type })).unwrap();
            expect(fn).toEqual(
                enabled ? expect.objectContaining({ name: definition.name, type: 'tool', source: 'tools-catalog', uuid: definition.uuid }) : undefined
            );
        }
        expect((await getFunction({ ...scope, name: definition.name, type: 'action' })).unwrap()).toBeUndefined();
        const listed = (await listFunctions({ ...scope, type: 'tool', search: undefined, limit: catalog.length, offset: 0 })).unwrap();
        const names = [
            ...catalog
                .filter((entry) => entry.type === 'tool')
                .map(({ name }) => name)
                .sort(),
            ...catalog
                .filter((entry) => entry.type === 'action')
                .map(({ name }) => name)
                .sort()
        ];
        expect(listed.total).toBe(enabled ? catalog.length : 0);
        expect(listed.rows.map(({ name }) => name)).toEqual(enabled ? names : []);
    });
});
