import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { getFunction, listFunctions, ListFunctionsError } from './service.js';

import type { FunctionRow } from './models/functions.js';

const { mockFindActiveByEnvironment, mockFindActiveByName, mockGetProviderConfig, mockListCatalogActions, mockGetCatalogAction } = vi.hoisted(() => {
    return {
        mockFindActiveByEnvironment: vi.fn(),
        mockFindActiveByName: vi.fn(),
        mockGetProviderConfig: vi.fn(),
        mockListCatalogActions: vi.fn(),
        mockGetCatalogAction: vi.fn()
    };
});

vi.mock('../../config.service.js', () => ({
    default: { getProviderConfig: mockGetProviderConfig }
}));

vi.mock('../../catalog/actions.js', () => ({
    listCatalogActions: mockListCatalogActions,
    getCatalogAction: mockGetCatalogAction,
    isCatalogActionEnabled: ({ name, autoEnable, overrides }: { name: string; autoEnable: boolean; overrides: Record<string, boolean> }) =>
        Object.hasOwn(overrides, name) ? overrides[name] === true : autoEnable
}));

vi.mock('./models/functions.js', () => ({
    findActiveByEnvironment: mockFindActiveByEnvironment,
    findActiveByName: mockFindActiveByName
}));

const baseRow: FunctionRow = {
    id: 1,
    name: 'users',
    type: 'sync',
    metadata: { description: 'Sync users', scopes: ['read:users'] },
    input: 'UserInput',
    returns: ['User'],
    json_schema: null,
    runs: 'every day',
    auto_start: true,
    track_deletes: false,
    enabled: true,
    last_deployed: new Date('2026-01-01T00:00:00.000Z'),
    source: 'repo',
    event: null
};

const integration = {
    id: 1,
    provider: 'github',
    auto_enable_catalog_actions: false,
    catalog_action_overrides: {}
};

const originalHasLiveCatalogActions = flags.hasLiveCatalogActions;

describe('functions service', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        flags.hasLiveCatalogActions = false;
        mockGetProviderConfig.mockResolvedValue(integration);
        mockListCatalogActions.mockReturnValue([]);
        mockGetCatalogAction.mockReturnValue(undefined);
        mockFindActiveByEnvironment.mockResolvedValue({ rows: [baseRow], total: 1 });
    });

    afterEach(() => {
        flags.hasLiveCatalogActions = originalHasLiveCatalogActions;
    });

    it('returns mapped rows and total for valid functions', async () => {
        const result = await listFunctions({
            environmentId: 1,
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

        expect(result.value).toEqual({
            rows: [
                {
                    id: 1,
                    name: 'users',
                    type: 'sync',
                    description: 'Sync users',
                    scopes: ['read:users'],
                    input: 'UserInput',
                    returns: ['User'],
                    json_schema: null,
                    runs: 'every day',
                    auto_start: true,
                    track_deletes: false,
                    enabled: true,
                    last_deployed: '2026-01-01T00:00:00.000Z',
                    source: 'repo'
                }
            ],
            total: 1
        });
        expect(mockGetProviderConfig).toHaveBeenCalledWith('github', 1);
        expect(mockFindActiveByEnvironment).toHaveBeenCalledWith({
            environmentId: 1,
            providerConfigKey: 'github',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0,
            catalog: []
        });
        expect(mockListCatalogActions).not.toHaveBeenCalled();
    });

    it('does not merge live catalog actions when FLAG_LIVE_CATALOG_ACTIONS_ENABLED is off', async () => {
        mockListCatalogActions.mockReturnValue([{ name: 'create-issue' }]);

        await listFunctions({
            environmentId: 1,
            providerConfigKey: 'github',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0
        });

        expect(mockListCatalogActions).not.toHaveBeenCalled();
        expect(mockFindActiveByEnvironment).toHaveBeenCalledWith(expect.objectContaining({ catalog: [] }));
    });

    it('merges live catalog actions when FLAG_LIVE_CATALOG_ACTIONS_ENABLED is on', async () => {
        flags.hasLiveCatalogActions = true;
        const catalog = [{ name: 'create-issue' }];
        mockListCatalogActions.mockReturnValue(catalog);

        await listFunctions({
            environmentId: 1,
            providerConfigKey: 'github',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0
        });

        expect(mockListCatalogActions).toHaveBeenCalledWith('github');
        expect(mockFindActiveByEnvironment).toHaveBeenCalledWith(expect.objectContaining({ catalog }));
    });

    it('returns a typed error when the integration does not exist', async () => {
        mockGetProviderConfig.mockResolvedValue(null);

        const result = await listFunctions({
            environmentId: 1,
            providerConfigKey: 'missing',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(ListFunctionsError);
            expect(result.error).toMatchObject({ code: 'integration_not_found', message: 'Integration does not exist' });
        }
        expect(mockFindActiveByEnvironment).not.toHaveBeenCalled();
    });

    it('wraps unexpected listing failures in a typed internal error', async () => {
        const cause = new Error('database failed');
        mockFindActiveByEnvironment.mockRejectedValue(cause);

        const result = await listFunctions({
            environmentId: 1,
            providerConfigKey: 'github',
            type: 'sync',
            search: 'user',
            limit: 10,
            offset: 20
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(ListFunctionsError);
            expect(result.error).toMatchObject({ code: 'list_failed', message: 'Failed to list functions', cause });
        }
    });

    it('returns Err instead of silently dropping invalid on-event rows', async () => {
        mockFindActiveByEnvironment.mockResolvedValue({
            rows: [{ ...baseRow, type: 'on-event', event: 'UNKNOWN_EVENT', input: null, returns: null, runs: null, auto_start: null, track_deletes: null }],
            total: 1
        });

        const result = await listFunctions({
            environmentId: 1,
            providerConfigKey: 'github',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(ListFunctionsError);
            expect(result.error).toMatchObject({ code: 'list_failed', message: 'Failed to list functions' });
        }
    });

    it('returns Err when a single function row cannot be mapped', async () => {
        mockFindActiveByName.mockResolvedValue({
            ...baseRow,
            type: 'on-event',
            input: null,
            returns: null,
            runs: null,
            auto_start: null,
            track_deletes: null,
            event: 'UNKNOWN_EVENT'
        });

        const result = await getFunction({
            environmentId: 1,
            providerConfigKey: 'github',
            name: 'users',
            type: 'on-event'
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('failed_to_get_function');
        }
    });

    it('does not return a live catalog action when FLAG_LIVE_CATALOG_ACTIONS_ENABLED is off', async () => {
        mockFindActiveByName.mockResolvedValue(undefined);
        mockGetCatalogAction.mockReturnValue({ name: 'create-issue' });

        const result = await getFunction({
            environmentId: 1,
            providerConfigKey: 'github',
            name: 'create-issue',
            type: 'action'
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toBeUndefined();
        expect(mockGetCatalogAction).not.toHaveBeenCalled();
    });

    it('returns a live catalog action when FLAG_LIVE_CATALOG_ACTIONS_ENABLED is on', async () => {
        flags.hasLiveCatalogActions = true;
        mockFindActiveByName.mockResolvedValue(undefined);
        mockGetCatalogAction.mockReturnValue({
            name: 'create-issue',
            description: 'Create an issue',
            scopes: [],
            input: null,
            output: [],
            endpoint: null,
            json_schema: null,
            sdk_version: '0.0.0-zero',
            features: [],
            version: '1.0.0'
        });

        const result = await getFunction({
            environmentId: 1,
            providerConfigKey: 'github',
            name: 'create-issue',
            type: 'action'
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toMatchObject({ name: 'create-issue', source: 'nango-catalog', id: null });
        expect(mockGetCatalogAction).toHaveBeenCalledWith('github', 'create-issue');
    });
});
