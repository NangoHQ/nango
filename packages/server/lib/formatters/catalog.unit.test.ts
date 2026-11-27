import { describe, expect, it } from 'vitest';

import { catalogFunctionToApi } from './catalog.js';

import type { CatalogFunction } from '../services/catalog.service.js';
import type { CatalogFunctionDefinition } from '@nangohq/shared';
import type { NangoSyncConfig, ToolTags } from '@nangohq/types';

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

function catalogTool(tags: ToolTags | undefined): CatalogFunction {
    const template = { name: 'create-record', tags } as unknown as CatalogFunctionDefinition;
    return { name: template.name, type: 'tool', description: 'Create a record', template };
}

describe('catalogFunctionToApi meta', () => {
    it('converts legacy scopes to an all-of requirement', () => {
        expect(catalogFunctionToApi(legacyFunction({ scopes: ['read', 'write'] })).meta).toStrictEqual({
            tags: {},
            required_scopes: { all: ['read', 'write'] }
        });
    });

    it('leaves required_scopes out when a legacy function declares no scopes', () => {
        expect(catalogFunctionToApi(legacyFunction({})).meta).toStrictEqual({ tags: {} });
        expect(catalogFunctionToApi(legacyFunction({ scopes: [] })).meta).toStrictEqual({ tags: {} });
    });

    it("splits a tool's tags into instructions, required scopes and the remaining tags", () => {
        const meta = catalogFunctionToApi(
            catalogTool({
                instructions: 'Get the domain from `list-domains`.',
                required_scopes: { any: ['domain:create', 'domain:update'] },
                read_only_hint: 'false',
                destructive_hint: 'false'
            })
        ).meta;

        expect(meta).toStrictEqual({
            instructions: 'Get the domain from `list-domains`.',
            required_scopes: { any: ['domain:create', 'domain:update'] },
            tags: { read_only_hint: 'false', destructive_hint: 'false' }
        });
    });

    it('returns empty tags for a tool without tags', () => {
        expect(catalogFunctionToApi(catalogTool(undefined)).meta).toStrictEqual({ tags: {} });
    });
});
