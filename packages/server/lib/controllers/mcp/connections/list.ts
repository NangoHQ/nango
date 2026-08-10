import * as z from 'zod/v4';

import { connectionService, connectionTagsSchema } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { connectionIdSchema, endUserSchema, providerConfigKeySchema } from '../../../helpers/validation.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { connectionToMcp } from './formatter.js';
import { listConnectionsOutputSchema } from './schema.js';

import type { ListConnectionsOutput } from './schema.js';

const listConnectionsArgumentsSchema = z
    .object({
        connection_id: connectionIdSchema.min(1).optional(),
        search: z.string().min(1).max(255).optional(),
        end_user_id: endUserSchema.shape.id.optional(),
        integration_id: providerConfigKeySchema.min(1).optional(),
        end_user_organization_id: z.string().min(1).max(255).optional(),
        tags: connectionTagsSchema.optional(),
        limit: z.number().int().min(1).max(10_000).optional(),
        page: z.number().int().min(0).optional()
    })
    .strict();

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
            limit: args.limit || 10_000,
            page: args.page
        });

        return Ok({
            connections: connections.map((connection) => connectionToMcp(connection))
        });
    }
});
