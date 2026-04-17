import { Ok } from '@nangohq/utils';

import { envs } from '../env.js';

import type { DBPlan, NangoProps, Result, RoutingContext } from '@nangohq/types';

const runtimeSelectors = {
    sync: (plan: DBPlan) => plan.sync_function_runtime,
    action: (plan: DBPlan) => plan.action_function_runtime,
    webhook: (plan: DBPlan) => plan.webhook_function_runtime,
    'on-event': (plan: DBPlan) => plan.on_event_function_runtime
};

export async function getFleetId({
    nangoProps,
    routingContext
}: {
    nangoProps: NangoProps;
    routingContext: RoutingContext;
}): Promise<Result<string | undefined>> {
    if (!routingContext.plan) {
        return Promise.resolve(Ok(envs.RUNNER_FLEET_ID));
    }
    const runtime = runtimeSelectors[nangoProps.scriptType](routingContext.plan);
    switch (runtime) {
        case 'lambda':
            // syncs that are not checkpointed are still run on runner fleet
            // making sure that only syncs that can be safely interrupted/resumed are run on lambda fleet
            if (nangoProps.scriptType === 'sync' && routingContext.plan.sync_lambda_checkpoint_required && !routingContext.features.includes('checkpoints')) {
                return Promise.resolve(Ok(envs.RUNNER_FLEET_ID));
            }
            return Promise.resolve(Ok(envs.RUNNER_LAMBDA_FLEET_ID));
        default:
            return Promise.resolve(Ok(envs.RUNNER_FLEET_ID));
    }
}
