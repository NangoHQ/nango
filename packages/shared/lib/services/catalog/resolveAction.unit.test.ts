import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { resolveRunnableAction } from './resolveAction.js';

import type { DBSyncConfig, IntegrationConfig } from '@nangohq/types';

const { mockGetSyncConfigRaw, mockGetCatalogAction } = vi.hoisted(() => {
    return {
        mockGetSyncConfigRaw: vi.fn(),
        mockGetCatalogAction: vi.fn()
    };
});

vi.mock('../sync/config/config.service.js', () => ({
    getSyncConfigRaw: mockGetSyncConfigRaw
}));

vi.mock('./actions.js', () => ({
    getCatalogAction: mockGetCatalogAction,
    catalogActionJsPath: ({ provider, name }: { provider: string; name: string }) => `templates-zero/${provider}/build/${provider}_actions_${name}.cjs`,
    isCatalogActionEnabled: ({ name, autoEnable, overrides }: { name: string; autoEnable: boolean; overrides: Record<string, boolean> }) =>
        Object.hasOwn(overrides, name) ? overrides[name] === true : autoEnable
}));

const config: IntegrationConfig = {
    id: 9,
    unique_key: 'github',
    provider: 'github',
    oauth_client_id: null,
    oauth_client_secret: null,
    environment_id: 1,
    missing_fields: [],
    display_name: 'GitHub',
    forward_webhooks: true,
    shared_credentials_id: null,
    auto_enable_catalog_actions: true,
    catalog_action_overrides: {},
    created_at: new Date(),
    updated_at: new Date(),
    deleted: false
};

const originalHasLiveCatalogActions = flags.hasLiveCatalogActions;

describe('resolveRunnableAction', () => {
    beforeEach(() => {
        flags.hasLiveCatalogActions = true;
        mockGetSyncConfigRaw.mockReset();
        mockGetCatalogAction.mockReset();
    });

    afterEach(() => {
        flags.hasLiveCatalogActions = originalHasLiveCatalogActions;
    });

    it('returns the deployed row when one exists', async () => {
        const deployed = { id: 44, sync_name: 'create-issue', enabled: true } as DBSyncConfig;
        mockGetSyncConfigRaw.mockResolvedValue(deployed);

        const result = await resolveRunnableAction({ environmentId: 1, integration: config, name: 'create-issue' });

        expect(result).toEqual({ kind: 'deployed', config: deployed });
        expect(mockGetCatalogAction).not.toHaveBeenCalled();
    });

    it('returns a synthetic config when the catalog action is on and not deployed', async () => {
        mockGetSyncConfigRaw.mockResolvedValue(null);
        mockGetCatalogAction.mockReturnValue({
            name: 'create-issue',
            description: 'Create an issue',
            scopes: ['repo'],
            input: 'Issue',
            output: ['Issue'],
            endpoint: null,
            json_schema: null,
            sdk_version: '0.0.0-zero',
            features: [],
            version: '1.0.0'
        });

        const result = await resolveRunnableAction({ environmentId: 1, integration: config, name: 'create-issue' });

        expect(result.kind).toBe('catalog');
        if (result.kind !== 'catalog') {
            return;
        }
        expect(result.config.id).toBe(0);
        expect(result.config.enabled).toBe(true);
        expect(result.config.file_location).toBe('templates-zero/github/build/github_actions_create-issue.cjs');
        expect(result.config.sync_name).toBe('create-issue');
        expect(result.catalog.name).toBe('create-issue');
    });

    it('returns a disabled catalog config when the catalog action is off', async () => {
        mockGetSyncConfigRaw.mockResolvedValue(null);
        mockGetCatalogAction.mockReturnValue({
            name: 'create-issue',
            description: '',
            scopes: [],
            input: null,
            output: [],
            endpoint: null,
            json_schema: null,
            sdk_version: '0.0.0-zero',
            features: [],
            version: '1.0.0'
        });

        const result = await resolveRunnableAction({
            environmentId: 1,
            integration: { ...config, auto_enable_catalog_actions: false },
            name: 'create-issue'
        });

        expect(result.kind).toBe('catalog');
        if (result.kind !== 'catalog') {
            return;
        }
        expect(result.config.enabled).toBe(false);
    });

    it('returns missing when the name is not in the catalog', async () => {
        mockGetSyncConfigRaw.mockResolvedValue(null);
        mockGetCatalogAction.mockReturnValue(undefined);

        const result = await resolveRunnableAction({ environmentId: 1, integration: config, name: 'not-a-catalog-action' });

        expect(result).toEqual({ kind: 'missing' });
    });

    it('does not fall back to the catalog when FLAG_LIVE_CATALOG_ACTIONS_ENABLED is off', async () => {
        flags.hasLiveCatalogActions = false;
        mockGetSyncConfigRaw.mockResolvedValue(null);
        mockGetCatalogAction.mockReturnValue({
            name: 'create-issue',
            description: '',
            scopes: [],
            input: null,
            output: [],
            endpoint: null,
            json_schema: null,
            sdk_version: '0.0.0-zero',
            features: [],
            version: '1.0.0'
        });

        const result = await resolveRunnableAction({ environmentId: 1, integration: config, name: 'create-issue' });

        expect(result).toEqual({ kind: 'missing' });
        expect(mockGetCatalogAction).not.toHaveBeenCalled();
    });
});
