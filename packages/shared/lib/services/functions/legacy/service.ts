import { Err, flags, Ok } from '@nangohq/utils';

import { getCatalogAction, isCatalogActionEnabled, listCatalogActions } from '../../catalog/actions.js';
import configService from '../../config.service.js';
import { toListedLiveCatalogAction, toListedNangoFunction } from './mappers.js';
import * as functionsModel from './models/functions.js';

import type { FunctionRow } from './models/functions.js';
import type { FunctionType, ListedNangoFunction } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type ListFunctionsErrorCode = 'integration_not_found' | 'list_failed';

export class ListFunctionsError extends Error {
    public readonly code: ListFunctionsErrorCode;

    constructor({ code, message, cause }: { code: ListFunctionsErrorCode; message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'ListFunctionsError';
        this.code = code;
    }
}

/**
 * Lists functions for a single integration: deployed syncs/actions/on-events plus live
 * catalog actions.
 */
export async function listFunctions({
    environmentId,
    providerConfigKey,
    type,
    search,
    limit,
    offset
}: {
    environmentId: number;
    providerConfigKey: string;
    type: FunctionType | undefined;
    search: string | undefined;
    limit: number;
    offset: number;
}): Promise<Result<{ rows: ListedNangoFunction[]; total: number }, ListFunctionsError>> {
    try {
        const integration = await configService.getProviderConfig(providerConfigKey, environmentId);
        if (!integration) {
            return Err(
                new ListFunctionsError({
                    code: 'integration_not_found',
                    message: 'Integration does not exist'
                })
            );
        }

        const catalog = flags.hasLiveCatalogActions && (type === undefined || type === 'action') ? listCatalogActions(integration.provider) : [];

        const page = await functionsModel.findActiveByEnvironment({
            environmentId,
            providerConfigKey,
            type,
            search,
            limit,
            offset,
            catalog
        });
        return mapListingPage(page);
    } catch (err) {
        return Err(new ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions', cause: err }));
    }
}

/**
 * Fetches a single function by name within a provider config.
 * If `type` is omitted and multiple types share the same name, the first
 * match by the listing's stable order is returned. Deployed rows win over live catalog.
 */
export async function getFunction({
    environmentId,
    providerConfigKey,
    name,
    type
}: {
    environmentId: number;
    providerConfigKey: string;
    name: string;
    type: FunctionType | undefined;
}): Promise<Result<ListedNangoFunction | undefined>> {
    try {
        const row = await functionsModel.findActiveByName({ environmentId, providerConfigKey, name, type });
        if (row) {
            const fn = toListedNangoFunction(row);
            if (fn.isErr()) {
                return Err(new Error('failed_to_get_function', { cause: fn.error }));
            }
            return Ok(fn.value);
        }

        if (!flags.hasLiveCatalogActions || (type !== undefined && type !== 'action')) {
            return Ok(undefined);
        }

        const integration = await configService.getProviderConfig(providerConfigKey, environmentId);
        if (!integration) {
            return Ok(undefined);
        }

        const action = getCatalogAction(integration.provider, name);
        if (!action) {
            return Ok(undefined);
        }

        return Ok(
            toListedLiveCatalogAction(
                action,
                isCatalogActionEnabled({
                    name,
                    autoEnable: integration.auto_enable_catalog_actions,
                    overrides: integration.catalog_action_overrides ?? {}
                })
            )
        );
    } catch (err) {
        return Err(new Error('failed_to_get_function', { cause: err }));
    }
}

function mapListingPage(page: { rows: FunctionRow[]; total: number }): Result<{ rows: ListedNangoFunction[]; total: number }, ListFunctionsError> {
    const mapped = mapListingRows(page.rows);
    if (mapped.isErr()) {
        return Err(mapped.error);
    }
    return Ok({ rows: mapped.value, total: page.total });
}

function mapListingRows(rows: FunctionRow[]): Result<ListedNangoFunction[], ListFunctionsError> {
    const mapped: ListedNangoFunction[] = [];
    for (const row of rows) {
        const fn = toListedNangoFunction(row);
        if (fn.isErr()) {
            return Err(new ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions', cause: fn.error }));
        }
        mapped.push(fn.value);
    }
    return Ok(mapped);
}
