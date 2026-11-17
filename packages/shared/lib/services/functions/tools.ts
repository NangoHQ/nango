import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import { getCatalogEntry } from '../catalog/actions.js';
import { resolveLegacyAction } from '../catalog/resolveLegacyAction.js';
import { search } from './models/functions.js';

import type { ResolvedLegacyAction } from '../catalog/resolveLegacyAction.js';
import type { FunctionSource, IntegrationConfig } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type ResolvedTool =
    | { kind: 'function'; uuid: string; source: FunctionSource; inputSchemaRef: string | null }
    | { kind: 'missing'; source?: FunctionSource }
    | Exclude<ResolvedLegacyAction, { kind: 'missing' }>;

/**
 * Resolves an enabled tool by name, by order of priority:
 * 1. deployed tool functions
 * 2. deployed legacy actions
 * 3. legacy catalog actions (tools-catalog on)
 * 4. catalog tool functions
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
        filter: { integrationKey: integration.unique_key, name, trigger: { kind: 'http', subscriptions: 'none' } }
    });
    if (functions.isErr()) {
        return Err(functions.error);
    }

    const fn = functions.value[0];
    if (fn) {
        const { config, currentVersion } = fn;
        return Ok(
            config.enabled
                ? { kind: 'function', uuid: config.uuid, source: currentVersion.source, inputSchemaRef: currentVersion.input_schema_ref }
                : { kind: 'missing', source: currentVersion.source }
        );
    }

    try {
        const tool = await resolveLegacyAction({ accountUuid, environmentId, integration, name });
        if (tool.kind === 'deployed' && !tool.config.enabled) {
            return Ok({ kind: 'missing', source: tool.config.source });
        }
        if (tool.kind !== 'missing') {
            return Ok(tool);
        }

        const definition = getCatalogEntry(integration.provider, name);
        if (definition?.module !== 'function' || definition.trigger.kind !== 'http' || definition.trigger.subscriptions?.length) {
            return Ok({ kind: 'missing' });
        }
        return Ok({ kind: 'function', uuid: definition.uuid, source: definition.source, inputSchemaRef: definition.input_schema_ref });
    } catch (err) {
        return Err(new Error('failed_to_resolve_tool', { cause: err }));
    }
}
