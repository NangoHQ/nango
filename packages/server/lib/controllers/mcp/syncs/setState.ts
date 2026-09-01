import { logContextGetter } from '@nangohq/logs';
import { normalizedSyncParams, SyncCommand, syncManager } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { syncTargets } from '../../../middleware/audit/index.js';
import { getOrchestrator } from '../../../utils/utils.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { PublicMcpError } from '../utils.js';
import { syncCommandErrorToMcp } from './errors.js';
import { setSyncsStateArgumentsSchema, setSyncsStateOutputSchema } from './schema.js';

import type { SetSyncsStateOutput } from './schema.js';
import type { AuditPolicy } from '@nangohq/types';

const orchestrator = getOrchestrator();

export const setSyncsStateTool = defineManagementMcpTool<typeof setSyncsStateArgumentsSchema, SetSyncsStateOutput>({
    name: 'syncs_set_state',
    description: 'Set one or more syncs to the started or paused state, optionally limited to one connection.',
    inputSchema: setSyncsStateArgumentsSchema,
    outputSchema: setSyncsStateOutputSchema,
    requiredScopes: { every: ['environment:syncs:execute'] },
    audit: {
        kind: 'dynamic-audit',
        policy: ({ args }) => syncStateAuditPolicy(args),
        targetFromOutput: ({ args }) => syncTargets(args.syncs, args.integration_id),
        metadata: ({ args }) => ({
            providerConfigKey: args.integration_id,
            ...(args.connection_id ? { connectionId: args.connection_id } : {})
        })
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    async handler({ args, environment }) {
        const syncIdentifiers = normalizedSyncParams(args.syncs);
        if (syncIdentifiers.isErr()) {
            return Err(new PublicMcpError(syncIdentifiers.error.message));
        }

        const result = await syncManager.runSyncCommand({
            orchestrator,
            environment,
            providerConfigKey: args.integration_id,
            syncIdentifiers: syncIdentifiers.value,
            command: args.state === 'started' ? SyncCommand.UNPAUSE : SyncCommand.PAUSE,
            logContextGetter,
            connectionId: args.connection_id,
            initiator: 'MCP call'
        });
        if (!result.success) {
            return Err(syncCommandErrorToMcp(result.error));
        }

        return Ok({ success: true as const });
    }
});

function syncStateAuditPolicy(args: unknown): AuditPolicy<'sync', 'started' | 'paused', 'environment'> | undefined {
    if (typeof args !== 'object' || args === null) {
        return undefined;
    }

    const state = (args as Record<string, unknown>)['state'];
    if (state !== 'started' && state !== 'paused') {
        return undefined;
    }

    return { kind: 'audit', resource: 'sync', action: state, scope: 'environment' };
}
