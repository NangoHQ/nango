import { environmentService } from '@nangohq/shared';

import type { DBEnvironment } from '@nangohq/types';

export type ManagementMcpEnvironment = Pick<DBEnvironment, 'id' | 'uuid' | 'name' | 'account_id' | 'is_production'>;
export type ManagementMcpEnvironmentLoader = () => Promise<readonly ManagementMcpEnvironment[]>;

export function createManagementMcpEnvironmentLoader(accountId: number): ManagementMcpEnvironmentLoader {
    let environmentsPromise: Promise<readonly ManagementMcpEnvironment[]> | undefined;

    return async () => {
        if (!environmentsPromise) {
            const loadPromise = loadManagementMcpEnvironments(accountId);
            environmentsPromise = loadPromise;
            void loadPromise.catch(() => {
                if (environmentsPromise === loadPromise) {
                    environmentsPromise = undefined;
                }
            });
        }

        return await environmentsPromise;
    };
}

async function loadManagementMcpEnvironments(accountId: number): Promise<readonly ManagementMcpEnvironment[]> {
    const environmentSummaries = await environmentService.getEnvironmentsByAccountId(accountId);
    if (environmentSummaries.isErr()) {
        throw environmentSummaries.error;
    }

    return environmentSummaries.value.map((environment) => ({ ...environment, account_id: accountId }));
}
