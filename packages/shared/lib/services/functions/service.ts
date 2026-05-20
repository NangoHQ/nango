import { Err, Ok } from '@nangohq/utils';

import { toDeployedNangoFunction } from './mappers.js';
import * as repository from './repository.js';

import type { DeployedNangoFunction, FunctionType } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

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
}): Promise<{ rows: DeployedNangoFunction[]; total: number }> {
    const { rows: dbRows, total } = await repository.findActiveByEnvironment({ environmentId, providerConfigKey, type, search, limit, offset });

    const rows = dbRows.flatMap((row) => {
        const fn = toDeployedNangoFunction(row);
        return fn ? [fn] : [];
    });

    return { rows, total };
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
        const row = await repository.findActiveByName({ environmentId, providerConfigKey, name, type });
        return Ok(row ? toDeployedNangoFunction(row) : undefined);
    } catch (err) {
        return Err(new Error('failed_to_get_function', { cause: err }));
    }
}
