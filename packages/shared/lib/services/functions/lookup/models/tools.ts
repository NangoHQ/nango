import db from '@nangohq/database';
import { SCHEMA_REF_PREFIX } from '@nangohq/utils';

import {
    buildListingSubquery,
    catalogEntries,
    catalogForIntegration,
    catalogToolsEnabled,
    hydrateCatalogJsonSchemas,
    integrationsInScope,
    markActionsEnabled
} from './listing.js';

import type { FunctionLookupScope, FunctionRow, IntegrationCatalogEntry } from './listing.js';
import type { ToolTags } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export interface ToolsetInventoryRow {
    integration_id: string;
    provider: string;
    name: string | null;
    type: 'sync' | 'action' | 'tool' | null;
    description: string | null;
    instructions?: string;
    tags?: ToolTags;
    enabled: boolean | null;
}

/**
 * Returns the inventory used to compile agent toolsets: deployed functions plus catalog tools
 * and legacy actions, with tool shadowing applied even when the deployed tool is disabled.
 *
 * Includes syncs so explicitly naming one can be rejected as the wrong function type, and a
 * row with null function columns for empty integrations so they are not mistaken for missing ones.
 */
export async function findToolsetInventory({
    environmentId,
    providerConfigKeys
}: {
    environmentId: number;
    providerConfigKeys?: string[] | undefined;
}): Promise<ToolsetInventoryRow[]> {
    const scope = { environmentId, providerConfigKeys };
    const { catalog, enabled } = await catalogInScope(scope);
    const listing = buildListingSubquery({ ...scope, type: undefined, search: undefined, catalog, includeOnEvents: false });
    const rows = await integrationsInScope(scope)
        .leftJoin(listing, 'listing.integration_id', 'nc.unique_key')
        .select<(Omit<ToolsetInventoryRow, 'instructions' | 'tags'> & { instructions: string | null; tags: ToolTags | null })[]>(
            'nc.unique_key AS integration_id',
            'nc.provider',
            'listing.name',
            'listing.type',
            db.knex.raw("listing.metadata->>'description' AS description"),
            db.knex.raw("listing.tool->'tags'->>'instructions' AS instructions"),
            db.knex.raw("NULLIF((listing.tool->'tags') - 'instructions', '{}'::jsonb) AS tags"),
            'listing.enabled'
        )
        .orderBy([
            { column: 'nc.unique_key', order: 'asc' },
            { column: 'listing.name', order: 'asc' },
            { column: 'listing.type', order: 'asc' }
        ]);
    const inventory = rows.map(({ instructions, tags, ...row }) => ({
        ...row,
        ...(instructions !== null && { instructions }),
        ...(tags !== null && { tags })
    }));
    return enabled ? markActionsEnabled(inventory) : inventory;
}

export interface ActionInputSchemaRow {
    integration_id: string;
    name: string;
    input: string | null;
    models_json_schema: { definitions?: Record<string, JSONSchema7> } | null;
}

/**
 * Returns the input model name and schema definitions for named actions and tools,
 * across as many integrations as the caller asks for in one batch.
 *
 * A tool occupies the name ahead of everything else, and a disabled one contributes no
 * schema. Otherwise an active deployed action occupies the name. When tools-catalog is on, that row contributes
 * its schema even if `_nango_sync_configs.enabled` is false. When the flag is off, a disabled
 * deployed row contributes no schema. The catalog is never a fallback for an occupied name,
 * and catalog schemas are returned only for unoccupied names.
 */
export async function findInputSchemas({
    environmentId,
    actions
}: {
    environmentId: number;
    actions: { integrationId: string; name: string }[];
}): Promise<ActionInputSchemaRow[]> {
    if (actions.length === 0) {
        return [];
    }

    const scope = { environmentId, providerConfigKeys: [...new Set(actions.map((action) => action.integrationId))] };
    const { catalog, enabled } = await catalogInScope(scope);
    const requested = new Set(actions.map((action) => JSON.stringify([action.integrationId, action.name])));
    const requestedCatalog = catalog.filter((tool) => requested.has(JSON.stringify([tool.integration_id, tool.name])));
    const listing = buildListingSubquery({ ...scope, type: 'tool', search: undefined, catalog: requestedCatalog });
    const rows = await db.knex
        .from(listing)
        .whereIn(
            ['integration_id', 'name'],
            actions.map((action) => [action.integrationId, action.name])
        )
        .andWhere(function () {
            this.where('enabled', true);
            if (enabled) {
                this.orWhere('type', 'action');
            }
        })
        .select<(Pick<FunctionRow, 'name' | 'type' | 'input' | 'json_schema' | 'source'> & { integration_id: string; input_schema_ref: string | null })[]>(
            'integration_id',
            'name',
            'type',
            'input',
            'json_schema',
            'source',
            db.knex.raw("tool->>'input_schema_ref' AS input_schema_ref")
        );
    hydrateCatalogJsonSchemas(rows, requestedCatalog);
    return rows.map((row) => {
        const input = row.type === 'tool' ? row.input_schema_ref : row.input;
        return {
            integration_id: row.integration_id,
            name: row.name,
            input: row.type === 'tool' && input?.startsWith(SCHEMA_REF_PREFIX) ? input.slice(SCHEMA_REF_PREFIX.length) : input,
            models_json_schema: row.json_schema as ActionInputSchemaRow['models_json_schema']
        };
    });
}

async function catalogInScope(scope: FunctionLookupScope): Promise<{ catalog: IntegrationCatalogEntry[]; enabled: boolean }> {
    const integrations = await integrationsInScope(scope)
        .join({ env: '_nango_environments' }, 'nc.environment_id', 'env.id')
        .join({ account: '_nango_accounts' }, 'env.account_id', 'account.id')
        .select<
            { integration_id: string; provider: string; account_uuid: string }[]
        >('nc.unique_key AS integration_id', 'nc.provider', db.knex.raw('account.uuid as account_uuid'));
    const enabled = await catalogToolsEnabled(integrations[0]?.account_uuid);
    return {
        catalog: enabled
            ? integrations.flatMap((integration) => catalogForIntegration(integration.integration_id, catalogEntries(integration.provider, undefined, enabled)))
            : [],
        enabled
    };
}
