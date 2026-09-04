import * as z from 'zod/v4';

import { Ok } from '@nangohq/utils';

import { defineManagementMcpAccountTool } from '../managementTool.js';

const listEnvironmentsInputSchema = z.object({}).strict();
const listEnvironmentsOutputSchema = z.object({
    environments: z.array(
        z.object({
            name: z.string(),
            is_production: z.boolean()
        })
    )
});

export const listEnvironmentsTool = defineManagementMcpAccountTool<typeof listEnvironmentsInputSchema, z.output<typeof listEnvironmentsOutputSchema>>({
    name: 'environments_list',
    description: 'List the Nango environments authorized for this OAuth session. Use one of these names as the environment argument for other tools.',
    inputSchema: listEnvironmentsInputSchema,
    outputSchema: listEnvironmentsOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    requiredScopes: { none: true },
    audit: { kind: 'no-audit', reason: 'read-only' },
    handler({ environments }) {
        return Ok({
            environments: environments.map((environment) => ({ name: environment.name, is_production: environment.is_production }))
        });
    }
});
