import { connectionService } from '@nangohq/shared';

import { defineManagementMcpTool } from '../managementTool.js';
import { getConnectionServiceErrorToMcp } from './errors.js';
import { retrievedConnectionToMcp } from './formatter.js';
import { getConnectionArgumentsSchema, getConnectionOutputSchema } from './schema.js';

import type { GetConnectionOutput } from './schema.js';

export const getConnectionsTool = defineManagementMcpTool<typeof getConnectionArgumentsSchema, GetConnectionOutput>({
    name: 'connections_get',
    title: 'Get Connection',
    description: 'Returns one connection.',
    inputSchema: getConnectionArgumentsSchema,
    outputSchema: getConnectionOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    requiredScopes: { anyOf: ['environment:connections:read', 'environment:connections:read_credentials'] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args, environment }) {
        return (
            await connectionService.getConnectionWithoutCredentials({
                environmentId: environment.id,
                connectionId: args.connection_id,
                integrationId: args.integration_id
            })
        )
            .map((connection) => retrievedConnectionToMcp(connection))
            .mapError((error) => getConnectionServiceErrorToMcp(error));
    }
});
