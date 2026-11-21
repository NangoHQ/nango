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
import type { FunctionListType } from '@nangohq/types';

const resolutionOrderBy = "type = 'tool' DESC, type, event, id";

export async function findActiveByEnvironment({
    environmentId,
    providerConfigKey,
    type,
    search,
    limit,
    offset
}: {
    environmentId: number;
    providerConfigKey: string;
    type: FunctionListType | undefined;
    search: string | undefined;
    limit: number;
    offset: number;
}): Promise<{ rows: FunctionRow[]; total: number }> {
    const config = await providerForConfig(environmentId, providerConfigKey);
    const toolsCatalogEnabled = await catalogToolsEnabled(config?.accountUuid);
    const catalog = catalogForIntegration(providerConfigKey, catalogEntries(config?.provider, type, toolsCatalogEnabled));
    const listing = buildListingSubquery({
        environmentId,
        providerConfigKeys: [providerConfigKey],
        type,
        search,
        catalog
    });
    const [pageRows, countRow] = await Promise.all([
        db.knex.from(listing).select<ScopedFunctionRow[]>('*').orderByRaw(listingOrderBy).limit(limit).offset(offset),
        db.knex.from(listing).count<{ total: string }[]>('* as total').first()
    ]);

    const total = countRow ? Number(countRow.total) : 0;
    hydrateCatalogJsonSchemas(pageRows, catalog);
    return { rows: toolsCatalogEnabled ? markActionsEnabled(pageRows) : pageRows, total };
}

export async function findActiveByName({
    environmentId,
    providerConfigKey,
    name,
    type
}: {
    environmentId: number;
    providerConfigKey: string;
    name: string;
    type: FunctionListType | undefined;
}): Promise<FunctionRow | undefined> {
    const config = await providerForConfig(environmentId, providerConfigKey);
    const toolsCatalogEnabled = await catalogToolsEnabled(config?.accountUuid);
    const catalog = catalogForIntegration(providerConfigKey, catalogEntries(config?.provider, type, toolsCatalogEnabled));
    const listing = buildListingSubquery({
        environmentId,
        providerConfigKeys: [providerConfigKey],
        type,
        search: undefined,
        catalog
    });

    const row = await db.knex.from(listing).select<ScopedFunctionRow[]>('*').where('name', name).orderByRaw(resolutionOrderBy).first();
    if (!row) {
        return undefined;
    }
    hydrateCatalogJsonSchemas([row], catalog);
    return toolsCatalogEnabled ? markActionsEnabled([row])[0] : row;
}
