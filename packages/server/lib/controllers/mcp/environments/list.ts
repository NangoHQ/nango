import { environmentService } from '@nangohq/shared';

import { listEnvironmentsInputSchema, listEnvironmentsOutputSchema } from './schema.js';

import type { ListEnvironmentsOutput } from './schema.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

export type ManagementMcpEnvironment = Pick<DBEnvironment, 'id' | 'uuid' | 'name' | 'account_id' | 'is_production'>;

export const listEnvironmentsTool = {
    name: 'environments_list',
    description: 'List the Nango environments currently available to your user.',
    inputSchema: listEnvironmentsInputSchema,
    outputSchema: listEnvironmentsOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler(environments: readonly ManagementMcpEnvironment[]): ListEnvironmentsOutput {
        return {
            environments: environments.map(({ name, is_production }) => ({ name, is_production }))
        };
    }
} as const;

export async function getManagementMcpEnvironments({ account }: { account: DBTeam }): Promise<ManagementMcpEnvironment[]> {
    const environmentSummaries = await environmentService.getEnvironmentsByAccountId(account.id);
    if (environmentSummaries.isErr()) {
        throw environmentSummaries.error;
    }

    return environmentSummaries.value.map((environment) => ({ ...environment, account_id: account.id }));
}
