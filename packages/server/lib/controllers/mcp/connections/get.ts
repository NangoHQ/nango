import { connectionService } from '@nangohq/shared';
import { Err, hasApiKeyScope } from '@nangohq/utils';

import { connectionRefreshFailed, connectionRefreshSuccess } from '../../../hooks/hooks.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { PublicMcpError } from '../utils.js';
import { getConnectionServiceErrorToMcp } from './errors.js';
import { retrievedConnectionToMcp } from './formatter.js';
import { getConnectionArgumentsSchema, getConnectionOutputSchema } from './schema.js';

import type { GetConnectionOutput } from './schema.js';

export const getConnectionsTool = defineManagementMcpTool<typeof getConnectionArgumentsSchema, GetConnectionOutput>({
    name: 'connections_get',
    description: 'Get one connection and its current credential state. Credential-reading access may refresh or rotate credential material.',
    inputSchema: getConnectionArgumentsSchema,
    outputSchema: getConnectionOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    requiredScopes: { anyOf: ['environment:connections:read', 'environment:connections:read_credentials'] },
    audit: { kind: 'no-audit', reason: 'non-auditable' },
    async handler({ args, account, environment, grantedScopes }) {
        const includeCredentials = hasApiKeyScope({
            grantedScopes,
            requiredScope: 'environment:connections:read_credentials'
        });
        const requestsCredentialOperation = args.refresh_token === true || args.force_refresh === true || args.refresh_github_app_jwt_token === true;
        if (!includeCredentials && requestsCredentialOperation) {
            return Err(new PublicMcpError('Credential and refresh options require the environment:connections:read_credentials scope'));
        }

        if (!includeCredentials) {
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

        return (
            await connectionService.getConnectionWithCredentials({
                account,
                environment,
                connectionId: args.connection_id,
                integrationId: args.integration_id,
                onRefreshFailed: connectionRefreshFailed,
                onRefreshSuccess: connectionRefreshSuccess,
                forceRefresh: args.force_refresh ?? false,
                returnRefreshToken: args.refresh_token ?? false,
                refreshGithubAppJwtToken: args.refresh_github_app_jwt_token ?? false
            })
        )
            .map((connection) => retrievedConnectionToMcp(connection))
            .mapError((error) => getConnectionServiceErrorToMcp(error));
    }
});
