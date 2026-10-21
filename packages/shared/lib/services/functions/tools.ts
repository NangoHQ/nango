import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import { resolveRunnableTool } from '../catalog/resolveTool.js';
import { listActions, ListFunctionsError } from './legacy/service.js';
import { search } from './models/functions.js';

import type { ResolveRunnableToolResult } from '../catalog/resolveTool.js';
import type { CurrentFunctionConfig } from './models/functions.js';
import type { IntegrationConfig, ListedNangoActionFunction } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type ResolvedTool = { kind: 'function'; fn: CurrentFunctionConfig } | ResolveRunnableToolResult;

export type ListedTool = { kind: 'function'; fn: CurrentFunctionConfig } | { kind: 'action'; action: ListedNangoActionFunction };

/**
 * Resolves a tool by name, by order of priority:
 * 1. tool functions, including disabled ones so they shadow same-named actions
 * 2. deployed actions
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
    const functions = await search(db.knex, {
        environmentId,
        filter: { integrationKey: integration.unique_key, name, trigger: { kind: 'http' } }
    });
    if (functions.isErr()) {
        return Err(functions.error);
    }

    const fn = functions.value[0];
    if (fn) {
        return Ok({ kind: 'function', fn });
    }

    try {
        return Ok(await resolveRunnableTool({ accountUuid, environmentId, integration, name }));
    } catch (err) {
        return Err(new Error('failed_to_resolve_tool', { cause: err }));
    }
}

/**
 * Lists enabled tools, by order of priority (a name is only listed once):
 * 1. tool functions, disabled ones hiding same-named actions
 * 2. deployed actions and catalog tools
 */
export async function listTools({
    environmentId,
    integrationKey
}: {
    environmentId: number;
    integrationKey: string;
}): Promise<Result<{ tools: ListedTool[]; provider: string }, ListFunctionsError>> {
    const [functions, actions] = await Promise.all([
        search(db.knex, { environmentId, filter: { integrationKey, trigger: { kind: 'http' } } }),
        listActions({ environmentId, providerConfigKey: integrationKey })
    ]);
    if (actions.isErr()) {
        return Err(actions.error);
    }
    if (functions.isErr()) {
        return Err(new ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions', cause: functions.error }));
    }

    const tools = new Map<string, ListedTool>(functions.value.map((fn) => [fn.config.name, { kind: 'function', fn }]));
    for (const action of actions.value.actions) {
        if (action.enabled && !tools.has(action.name)) {
            tools.set(action.name, { kind: 'action', action });
        }
    }

    const enabled = [...tools.values()].filter((tool) => tool.kind === 'action' || tool.fn.config.enabled);
    return Ok({ tools: enabled, provider: actions.value.provider });
}
