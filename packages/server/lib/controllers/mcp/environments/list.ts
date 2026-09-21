import { authorizeIn } from '@nangohq/authz';
import { environmentService } from '@nangohq/shared';

import { listEnvironmentsInputSchema, listEnvironmentsOutputSchema } from './schema.js';

import type { ListEnvironmentsOutput } from './schema.js';
import type { Principal } from '@nangohq/authz';
import type { DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export const listEnvironmentsTool = {
    name: 'environments_list',
    description: 'List the Nango environments currently available to your user.',
    inputSchema: listEnvironmentsInputSchema,
    outputSchema: listEnvironmentsOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async handler({ account, principal }: { account: DBTeam; principal: Principal }): Promise<Result<ListEnvironmentsOutput>> {
        const environmentSummaries = await environmentService.getEnvironmentsByAccountId(account.id);

        return environmentSummaries.map((environments) => ({
            environments: environments
                .filter((environment) => authorizeIn(principal, 'environment:settings:read', { ...environment, account_id: account.id }))
                .map(({ name, is_production }) => ({ name, is_production }))
        }));
    }
} as const;
