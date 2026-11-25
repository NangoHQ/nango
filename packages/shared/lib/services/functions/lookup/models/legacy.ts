import db from '@nangohq/database';

import {
    buildListingSubquery,
    catalogEntries,
    catalogForIntegration,
    catalogToolsEnabled,
    hydrateCatalogJsonSchemas,
    listingOrderBy,
    markActionsEnabled,
    providerForConfig
} from './listing.js';

import type { FunctionRow, ScopedFunctionRow } from './listing.js';

export async function hasActiveLegacyActions({ accountId }: { accountId: number }): Promise<boolean> {
    const row = await db.knex
        .from({ sc: '_nango_sync_configs' })
        .join({ env: '_nango_environments' }, 'env.id', 'sc.environment_id')
        .join({ nc: '_nango_configs' }, 'nc.id', 'sc.nango_config_id')
        .where('env.account_id', accountId)
        .whereNull('env.deleted_at')
        .where('nc.deleted', false)
        .where('sc.type', 'action')
        .where('sc.active', true)
        .where('sc.deleted', false)
        .select<{ id: number }[]>('sc.id')
        .first();
    return row !== undefined;
}

export async function findActiveActions({ environmentId, providerConfigKey }: { environmentId: number; providerConfigKey: string }): Promise<FunctionRow[]> {
    const config = await providerForConfig(environmentId, providerConfigKey);
    const toolsCatalogEnabled = await catalogToolsEnabled(config?.accountUuid);
    const catalog = catalogForIntegration(providerConfigKey, catalogEntries(config?.provider, 'action', toolsCatalogEnabled));
    const listing = buildListingSubquery({
        environmentId,
        providerConfigKeys: [providerConfigKey],
        type: 'action',
        search: undefined,
        catalog
    });
    const rows = await db.knex.from(listing).select<ScopedFunctionRow[]>('*').orderByRaw(listingOrderBy);
    hydrateCatalogJsonSchemas(rows, catalog);
    return toolsCatalogEnabled ? markActionsEnabled(rows) : rows;
}
