import { Ok } from '@nangohq/utils';

import { envs } from '../env.js';

import type { DBPlan, NangoProps, Result, RuntimeContext } from '@nangohq/types';

const runtimeSelectors = {
    sync: (plan: DBPlan) => plan.sync_function_runtime,
    action: (plan: DBPlan) => plan.action_function_runtime,
    webhook: (plan: DBPlan) => plan.webhook_function_runtime,
    'on-event': (plan: DBPlan) => plan.on_event_function_runtime
};

export async function getFleetId({
    nangoProps,
    runtimeContext
}: {
    nangoProps: NangoProps;
    runtimeContext: RuntimeContext;
}): Promise<Result<string | undefined>> {
    if (!runtimeContext.plan) {
        return Promise.resolve(Ok(envs.RUNNER_FLEET_ID));
    }
    const runtime = runtimeSelectors[nangoProps.scriptType](runtimeContext.plan);
    switch (runtime) {
        case 'lambda':
            return Promise.resolve(Ok(envs.RUNNER_LAMBDA_FLEET_ID));
        default:
            return Promise.resolve(Ok(envs.RUNNER_FLEET_ID));
    }
}
