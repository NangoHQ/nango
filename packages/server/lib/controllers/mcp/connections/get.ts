import * as z from 'zod/v4';

import { hasApiKeyScope } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../../helpers/validation.js';
import connectionRetrievalService from '../../../services/connectionRetrieval.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { getConnectionServiceErrorToMcp } from './errors.js';
import { retrievedConnectionToMcp } from './formatter.js';
import { getConnectionOutputSchema } from './schema.js';

import type { GetConnectionOutput } from './schema.js';

const getConnectionArgumentsSchema = z
    .object({
        connection_id: connectionIdSchema.min(1),
        integration_id: providerConfigKeySchema.min(1),
        refresh_token: z.boolean().optional(),
        force_refresh: z.boolean().optional(),
        refresh_github_app_jwt_token: z.boolean().optional()
    })
    .strict();

export const getConnectionsTool = defineManagementMcpTool<typeof getConnectionArgumentsSchema, GetConnectionOutput>({
    name: 'connections_get',
    description:
        'Get one connection and its current credential state. This tool is read-only unless an explicit refresh flag is set, which can refresh or rotate credential material.',
    inputSchema: getConnectionArgumentsSchema,
    outputSchema: getConnectionOutputSchema,
    annotations: { readOnlyHint: true },
    requiredScopes: { anyOf: ['environment:connections:read', 'environment:connections:read_credentials'] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args, account, environment, grantedScopes }) {
        const result = await connectionRetrievalService.get({
            account,
            environment,
            connectionId: args.connection_id,
            integrationId: args.integration_id,
            forceRefresh: args.force_refresh ?? false,
            returnRefreshToken: args.refresh_token ?? false,
            refreshGithubAppJwtToken: args.refresh_github_app_jwt_token ?? false
        });

        return result
            .map((connection) => {
                const includeCredentials = hasApiKeyScope({
                    grantedScopes,
                    requiredScope: 'environment:connections:read_credentials'
                });
                return retrievedConnectionToMcp(includeCredentials ? connection : { ...connection, credentials: undefined });
            })
            .mapError((error) => getConnectionServiceErrorToMcp(error));
    }
});
