import { Err, Ok } from '@nangohq/utils';

import configService from '../../config.service.js';
import { toListedNangoFunction } from './mappers.js';
import * as functionsModel from './models/functions.js';

import type { FunctionRow } from './models/functions.js';
import type { FunctionType, ListedNangoActionFunction, ListedNangoFunction } from '@nangohq/types';
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
 * Lists functions for a single integration: deployed syncs/actions/on-events plus
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
        const integrationId = await configService.getIdByProviderConfigKey(environmentId, providerConfigKey);
        if (!integrationId) {
            return Err(
                new ListFunctionsError({
                    code: 'integration_not_found',
                    message: 'Integration does not exist'
                })
            );
        }

        const page = await functionsModel.findActiveByEnvironment({
            environmentId,
            providerConfigKey,
            type,
            search,
            limit,
            offset
        });
        return mapListingPage(page);
    } catch (err) {
        return Err(new ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions', cause: err }));
    }
}

/**
 * Lists all action functions for a single integration without pagination.
 * The result includes disabled actions so callers can decide how to expose them.
 */
export async function listActions({
    environmentId,
    providerConfigKey,
    limit = 200
}: {
    environmentId: number;
    providerConfigKey: string;
    limit?: number;
}): Promise<Result<ListedNangoActionFunction[], ListFunctionsError>> {
    try {
        const integrationId = await configService.getIdByProviderConfigKey(environmentId, providerConfigKey);
        if (!integrationId) {
            return Err(
                new ListFunctionsError({
                    code: 'integration_not_found',
                    message: 'Integration does not exist'
                })
            );
        }

        const rows = await functionsModel.findActiveActions({ environmentId, providerConfigKey, limit });
        const mapped = mapListingRows(rows);
        if (mapped.isErr()) {
            return Err(mapped.error);
        }

        return Ok(mapped.value.filter((row): row is ListedNangoActionFunction => row.type === 'action'));
    } catch (err) {
        return Err(new ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions', cause: err }));
    }
}

/**
 * Fetches a single function by name within a provider config.
 * If `type` is omitted and multiple types share the same name, the first
 * match by the listing's stable order is returned. Deployed rows win over catalog.
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
        if (!row) {
            return Ok(undefined);
        }

        const fn = toListedNangoFunction(row);
        if (fn.isErr()) {
            return Err(new Error('failed_to_get_function', { cause: fn.error }));
        }
        return Ok(fn.value);
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
