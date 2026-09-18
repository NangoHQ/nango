import { environmentService } from '@nangohq/shared';

import { listEnvironmentsInputSchema, listEnvironmentsOutputSchema } from './schema.js';

import type { DBEnvironment, DBTeam } from '@nangohq/types';

export type ManagementMcpEnvironment = Pick<DBEnvironment, 'id' | 'name' | 'is_production'>;

export const listEnvironmentsTool = {
    name: 'environments_list',
    description: 'List the Nango environments currently available to your user.',
    inputSchema: listEnvironmentsInputSchema,
    outputSchema: listEnvironmentsOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler(environments: readonly ManagementMcpEnvironment[]) {
        return {
            environments: environments.map(({ name, is_production }) => ({ name, is_production }))
        };
    }
} as const;

export async function getManagementMcpEnvironments({ account }: { account: DBTeam }): Promise<DBEnvironment[]> {
    const environmentSummaries = await environmentService.getEnvironmentsByAccountId(account.id);
    if (environmentSummaries.isErr()) {
        throw environmentSummaries.error;
    }

    const environments = await Promise.all(
        environmentSummaries.value.map((environment) => environmentService.getByEnvironmentName(account.id, environment.name))
    );
    return environments.filter((environment): environment is DBEnvironment => environment !== null);
}
