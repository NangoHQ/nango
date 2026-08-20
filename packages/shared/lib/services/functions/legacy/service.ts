import { Err, Ok } from '@nangohq/utils';

import configService from '../../config.service.js';
import { toDeployedNangoFunction } from './mappers.js';
import * as functionsModel from './models/functions.js';

import type { DeployedNangoFunction, FunctionType } from '@nangohq/types';
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
 * Lists active deployed functions for a single integration across syncs,
 * actions, and on-event scripts. Pagination total is returned independently
 * of the page so out-of-range pages still surface the correct total.
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
}): Promise<Result<{ rows: DeployedNangoFunction[]; total: number }, ListFunctionsError>> {
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

        const { rows: dbRows, total } = await functionsModel.findActiveByEnvironment({ environmentId, providerConfigKey, type, search, limit, offset });
        const rows: DeployedNangoFunction[] = [];

        for (const row of dbRows) {
            const fn = toDeployedNangoFunction(row);
            if (fn.isErr()) {
                return Err(new ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions', cause: fn.error }));
            }
            rows.push(fn.value);
        }

        return Ok({ rows, total });
    } catch (err) {
        return Err(new ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions', cause: err }));
    }
}

/**
 * Fetches a single deployed function by name within a provider config.
 * If `type` is omitted and multiple types share the same name, the first
 * match by the listing's stable order is returned.
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
}): Promise<Result<DeployedNangoFunction | undefined>> {
    try {
        const row = await functionsModel.findActiveByName({ environmentId, providerConfigKey, name, type });
        if (!row) {
            return Ok(undefined);
        }

        const fn = toDeployedNangoFunction(row);
        if (fn.isErr()) {
            return Err(new Error('failed_to_get_function', { cause: fn.error }));
        }

        return Ok(fn.value);
    } catch (err) {
        return Err(new Error('failed_to_get_function', { cause: err }));
    }
}
