import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import { resolveRunnableTool } from '../catalog/resolveTool.js';
import { search } from './models/functions.js';

import type { ResolveRunnableToolResult } from '../catalog/resolveTool.js';
import type { CurrentFunctionConfig } from './models/functions.js';
import type { IntegrationConfig } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type ResolvedTool = { kind: 'function'; fn: CurrentFunctionConfig } | ResolveRunnableToolResult;

export type FoundTool = { kind: 'enabled'; fn: CurrentFunctionConfig } | { kind: 'disabled' } | { kind: 'none' };

/**
 * Finds the tool a name resolves to.
 */
export async function findTool({
    environmentId,
    integrationKey,
    name
}: {
    environmentId: number;
    integrationKey: string;
    name: string;
}): Promise<Result<FoundTool>> {
    const functions = await search(db.knex, {
        environmentId,
        filter: { integrationKey, name, trigger: { kind: 'http' } }
    });
    if (functions.isErr()) {
        return Err(functions.error);
    }

    const fn = functions.value[0];
    if (!fn) {
        return Ok({ kind: 'none' });
    }
    return Ok(fn.config.enabled ? { kind: 'enabled', fn } : { kind: 'disabled' });
}

/**
 * Resolves an enabled tool by name, by order of priority:
 * 1. tool functions, disabled ones resolving to missing so they shadow same-named actions
 * 2. deployed actions, disabled ones resolving to missing
 * 3. catalog tools
 */
export async function resolveTool({
    accountUuid,
    environmentId,
    integration,
    name
}: {
    accountUuid: string;
    environmentId: number;
    integration: Pick<IntegrationConfig, 'id' | 'provider' | 'unique_key'>;
    name: string;
}): Promise<Result<ResolvedTool>> {
    const found = await findTool({ environmentId, integrationKey: integration.unique_key, name });
    if (found.isErr()) {
        return Err(found.error);
    }

    switch (found.value.kind) {
        case 'enabled':
            return Ok({ kind: 'function', fn: found.value.fn });
        case 'disabled':
            return Ok({ kind: 'missing' });
        case 'none':
            break;
    }

    try {
        const tool = await resolveRunnableTool({ accountUuid, environmentId, integration, name });
        if (tool.kind === 'deployed' && !tool.config.enabled) {
            return Ok({ kind: 'missing' });
        }
        return Ok(tool);
    } catch (err) {
        return Err(new Error('failed_to_resolve_tool', { cause: err }));
    }
}
