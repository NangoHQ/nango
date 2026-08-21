import { connectionService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { defineManagementMcpTool } from '../managementTool.js';
import { connectionToMcp } from './formatter.js';
import { listConnectionsArgumentsSchema, listConnectionsOutputSchema } from './schema.js';

import type { ListConnectionsOutput } from './schema.js';

export const listConnectionsTool = defineManagementMcpTool<typeof listConnectionsArgumentsSchema, ListConnectionsOutput>({
    name: 'connections_list',
    description: 'List and filter connections in the authenticated Nango environment.',
    inputSchema: listConnectionsArgumentsSchema,
    outputSchema: listConnectionsOutputSchema,
    annotations: { readOnlyHint: true },
    requiredScopes: { anyOf: ['environment:connections:list', 'environment:connections:list_credentials'] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args, environment }) {
        const connections = await connectionService.listConnections({
            environmentId: environment.id,
            connectionId: args.connection_id,
            search: args.search,
            endUserId: args.end_user_id,
            integrationIds: args.integration_id ? [args.integration_id] : undefined,
            endUserOrganizationId: args.end_user_organization_id,
            tags: args.tags,
            ...(args.limit !== undefined ? { limit: args.limit } : {}),
            page: args.page
        });

        return Ok({
            connections: connections.map((connection) => connectionToMcp(connection))
        });
    }
});
