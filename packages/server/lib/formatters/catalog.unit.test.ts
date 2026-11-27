import { describe, expect, it } from 'vitest';

import { catalogFunctionToApi } from './catalog.js';

import type { CatalogFunction } from '../services/catalog.service.js';
import type { CatalogFunctionDefinition } from '@nangohq/shared';
import type { NangoSyncConfig, RequiredScopes } from '@nangohq/types';

function legacyFunction(config: Partial<NangoSyncConfig>): CatalogFunction {
    const template: NangoSyncConfig = {
        name: 'create-event',
        type: 'action',
        returns: [],
        endpoints: [],
        json_schema: null,
        sdk_version: null,
        features: [],
        ...config
    };
    return { name: template.name, type: 'action', description: null, template };
}

function catalogTool(requiredScopes: RequiredScopes | undefined): CatalogFunction {
    const template = { name: 'create-record', tags: requiredScopes ? { required_scopes: requiredScopes } : {} } as unknown as CatalogFunctionDefinition;
    return { name: template.name, type: 'tool', description: 'Create a record', template };
}

describe('catalogFunctionToApi required_scopes', () => {
    it('converts legacy scopes to an all-of requirement', () => {
        expect(catalogFunctionToApi(legacyFunction({ scopes: ['read', 'write'] })).required_scopes).toStrictEqual({ all: ['read', 'write'] });
    });

    it('returns null when a legacy function declares no scopes', () => {
        expect(catalogFunctionToApi(legacyFunction({})).required_scopes).toBeNull();
        expect(catalogFunctionToApi(legacyFunction({ scopes: [] })).required_scopes).toBeNull();
    });

    it("passes a tool's required scopes through", () => {
        expect(catalogFunctionToApi(catalogTool({ any: ['domain:create', 'domain:update'] })).required_scopes).toStrictEqual({
            any: ['domain:create', 'domain:update']
        });
        expect(catalogFunctionToApi(catalogTool({ all: ['data:write'] })).required_scopes).toStrictEqual({ all: ['data:write'] });
        expect(catalogFunctionToApi(catalogTool({ none: true })).required_scopes).toStrictEqual({ none: true });
    });

    it('returns null when a tool declares no required scopes', () => {
        expect(catalogFunctionToApi(catalogTool(undefined)).required_scopes).toBeNull();
    });
});
