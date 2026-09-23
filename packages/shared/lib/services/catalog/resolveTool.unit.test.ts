import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { resolveRunnableTool } from './resolveTool.js';

import type { CatalogTool } from './actions.js';
import type { DBSyncConfig, IntegrationConfig } from '@nangohq/types';

const { mockGetSyncConfigRaw, mockGetCatalogTool } = vi.hoisted(() => {
    return {
        mockGetSyncConfigRaw: vi.fn(),
        mockGetCatalogTool: vi.fn()
    };
});

vi.mock('../sync/config/config.service.js', () => ({
    getSyncConfigRaw: mockGetSyncConfigRaw
}));

vi.mock('./actions.js', () => ({
    getCatalogTool: mockGetCatalogTool
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
    created_at: new Date(),
    updated_at: new Date(),
    deleted: false
};

const catalogTool: CatalogTool = {
    name: 'create-issue',
    description: 'Create an issue',
    scopes: ['repo'],
    input: 'Issue',
    output: ['Issue'],
    jsonSchema: null,
    sdkVersion: '0.0.0-zero',
    version: '1.0.0',
    fileLocation: 'templates-zero/github/build/github_actions_create-issue.cjs',
    sourceLocation: 'templates-zero/github/actions/create-issue.ts',
    capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
    module: 'action'
};

const originalHasLiveCatalogActions = flags.hasLiveCatalogActions;

describe('resolveRunnableTool', () => {
    beforeEach(() => {
        flags.hasLiveCatalogActions = true;
        mockGetSyncConfigRaw.mockReset();
        mockGetCatalogTool.mockReset();
    });

    afterEach(() => {
        flags.hasLiveCatalogActions = originalHasLiveCatalogActions;
    });

    it('returns the deployed row when one exists', async () => {
        const deployed = { id: 44, sync_name: 'create-issue', enabled: true } as DBSyncConfig;
        mockGetSyncConfigRaw.mockResolvedValue(deployed);

        const result = await resolveRunnableTool({ environmentId: 1, integration: config, name: 'create-issue' });

        expect(result).toEqual({ kind: 'deployed', config: deployed });
        expect(mockGetSyncConfigRaw).toHaveBeenCalledWith({ environmentId: 1, config_id: 9, name: 'create-issue', isAction: true });
        expect(mockGetCatalogTool).not.toHaveBeenCalled();
    });

    it('returns the catalog tool when the name is not deployed', async () => {
        mockGetSyncConfigRaw.mockResolvedValue(null);
        mockGetCatalogTool.mockReturnValue(catalogTool);

        const result = await resolveRunnableTool({ environmentId: 1, integration: config, name: 'create-issue' });

        expect(result).toEqual({ kind: 'catalog', tool: catalogTool });
    });

    it('returns missing when the name is not in the catalog', async () => {
        mockGetSyncConfigRaw.mockResolvedValue(null);
        mockGetCatalogTool.mockReturnValue(undefined);

        const result = await resolveRunnableTool({ environmentId: 1, integration: config, name: 'not-a-catalog-action' });

        expect(result).toEqual({ kind: 'missing' });
    });

    it('does not fall back to the catalog when FLAG_LIVE_CATALOG_ACTIONS_ENABLED is off', async () => {
        flags.hasLiveCatalogActions = false;
        mockGetSyncConfigRaw.mockResolvedValue(null);
        mockGetCatalogTool.mockReturnValue(catalogTool);

        const result = await resolveRunnableTool({ environmentId: 1, integration: config, name: 'create-issue' });

        expect(result).toEqual({ kind: 'missing' });
        expect(mockGetCatalogTool).not.toHaveBeenCalled();
    });
});
