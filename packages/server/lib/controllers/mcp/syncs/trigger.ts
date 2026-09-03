import { logContextGetter } from '@nangohq/logs';
import { normalizedSyncParams, SyncCommand, syncManager } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { syncTargets } from '../../../middleware/audit/index.js';
import { getOrchestrator } from '../../../utils/utils.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { PublicMcpError } from '../utils.js';
import { syncCommandErrorToMcp } from './errors.js';
import { triggerSyncsArgumentsSchema, triggerSyncsOutputSchema } from './schema.js';

import type { TriggerSyncsOutput } from './schema.js';

const orchestrator = getOrchestrator();

export const triggerSyncsTool = defineManagementMcpTool<typeof triggerSyncsArgumentsSchema, TriggerSyncsOutput>({
    name: 'syncs_trigger',
    description: 'Trigger one or more syncs, optionally performing a full reset and/or clearing existing synced records.',
    inputSchema: triggerSyncsArgumentsSchema,
    outputSchema: triggerSyncsOutputSchema,
    requiredScopes: { every: ['environment:syncs:execute'] },
    audit: {
        kind: 'audit',
        resource: 'sync',
        action: 'triggered',
        scope: 'environment',
        targetFromOutput: ({ args }) => syncTargets(args.syncs, args.integration_id),
        metadata: ({ args }) => ({
            providerConfigKey: args.integration_id,
            ...(args.connection_id ? { connectionId: args.connection_id } : {}),
            reset: args.reset,
            emptyCache: args.empty_cache
        })
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
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
            command: args.reset ? SyncCommand.RUN_FULL : SyncCommand.RUN,
            deleteRecords: args.empty_cache,
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
