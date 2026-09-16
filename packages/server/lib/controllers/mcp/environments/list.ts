import * as z from 'zod/v4';

import { authorizeIn } from '@nangohq/authz';
import { environmentService } from '@nangohq/shared';

import { buildPrincipal } from '../../../authz/principal.js';

import type { DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

export type ManagementMcpEnvironment = Pick<DBEnvironment, 'id' | 'name' | 'is_production'>;

export const listEnvironmentsInputSchema = z.object({}).strict();
export const listEnvironmentsOutputSchema = z.object({
    environments: z.array(
        z.object({
            name: z.string(),
            is_production: z.boolean()
        })
    )
});

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

export async function getAuthorizedManagementMcpEnvironments({
    user,
    account,
    plan
}: {
    user: DBUser;
    account: DBTeam;
    plan: DBPlan | null;
}): Promise<ManagementMcpEnvironment[]> {
    const principal = buildPrincipal({ user, account, plan });
    if (!principal) {
        return [];
    }

    const environments = await environmentService.getEnvironmentsByAccountId(account.id);
    return environments.filter((environment) =>
        authorizeIn(principal, 'environment:settings:read', {
            id: environment.id,
            account_id: account.id,
            is_production: environment.is_production
        })
    );
}
