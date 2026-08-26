import { logContextGetter } from '@nangohq/logs';
import { normalizedSyncParams, SyncCommand, syncManager } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { makeAuditTarget } from '../../../audit.js';
import { getOrchestrator } from '../../../utils/utils.js';
import { normalizeSyncParams, syncTargetId } from '../../sync/helpers.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { PublicMcpError } from '../utils.js';
import { syncCommandErrorToMcp } from './errors.js';
import { setSyncsStateArgumentsSchema, setSyncsStateOutputSchema } from './schema.js';

import type { SetSyncsStateOutput } from './schema.js';
import type { AuditTarget } from '@nangohq/types';

const orchestrator = getOrchestrator();

export const setSyncsStateTool = defineManagementMcpTool<typeof setSyncsStateArgumentsSchema, SetSyncsStateOutput>({
    name: 'syncs_set_state',
    description: 'Set one or more syncs to the started or paused state, optionally limited to one connection.',
    inputSchema: setSyncsStateArgumentsSchema,
    outputSchema: setSyncsStateOutputSchema,
    requiredScopes: { every: ['environment:syncs:execute'] },
    audit: {
        kind: 'dynamic-audit',
        policy: ({ args }) => ({ kind: 'audit', resource: 'sync', action: args.state, scope: 'environment' }),
        targetFromOutput: ({ args }) => syncTargets(args.syncs),
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

function syncTargets(syncs: (string | { name: string; variant: string })[]): AuditTarget[] | undefined {
    const targets = normalizeSyncParams(syncs)
        .map(({ syncName, syncVariant }) => makeAuditTarget('sync', syncTargetId(syncName, syncVariant)))
        .filter((target): target is AuditTarget => Boolean(target));

    return targets.length > 0 ? targets : undefined;
}
