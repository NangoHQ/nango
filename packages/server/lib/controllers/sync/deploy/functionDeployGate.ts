import { getFlags } from '@nangohq/feature-flags';

import type { CLIDeployFlowConfig } from '@nangohq/types';

/**
 * Function deployment is gated to an allowlist of accounts (Unleash `function-deployment`) while the
 * primitive is rolled out. Returns true when the payload deploys a function but the account is not
 * allowlisted, so the caller can reject the deploy.
 */
export async function isFunctionDeployBlocked({ flowConfigs, accountUuid }: { flowConfigs: CLIDeployFlowConfig[]; accountUuid: string }): Promise<boolean> {
    const deploysFunction = flowConfigs.some((flow) => flow.type === 'function');
    if (!deploysFunction) {
        return false;
    }
    return !(await getFlags().canDeployFunctions(accountUuid));
}
