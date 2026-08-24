import { legacyFunctionService } from '@nangohq/shared';

import { defineManagementMcpTool } from '../managementTool.js';
import { listFunctionsServiceErrorToMcp } from './errors.js';
import { listFunctionsArgumentsSchema, listFunctionsOutputSchema } from './schema.js';

import type { ListFunctionsOutput } from './schema.js';

export const listFunctionsTool = defineManagementMcpTool<typeof listFunctionsArgumentsSchema, ListFunctionsOutput>({
    name: 'functions_list',
    description: 'List and filter functions deployed to an integration in the authenticated Nango environment.',
    inputSchema: listFunctionsArgumentsSchema,
    outputSchema: listFunctionsOutputSchema,
    annotations: { readOnlyHint: true },
    requiredScopes: { every: ['environment:functions:list'] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args, environment }) {
        const result = await legacyFunctionService.listFunctions({
            environmentId: environment.id,
            providerConfigKey: args.integration_id,
            type: args.type,
            search: args.search,
            limit: args.limit,
            offset: args.page * args.limit
        });

        return result
            .map(({ rows, total }) => ({
                data: rows,
                pagination: { total, page: args.page, limit: args.limit }
            }))
            .mapError((error) => listFunctionsServiceErrorToMcp(error));
    }
});
