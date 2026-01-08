import { Ok } from '@nangohq/utils';

import { envs } from '../env.js';

import type { DBPlan, NangoProps, Result } from '@nangohq/types';

const runtimeSelectors = {
    sync: (plan: DBPlan) => plan.sync_function_runtime,
    action: (plan: DBPlan) => plan.action_function_runtime,
    webhook: (plan: DBPlan) => plan.webhook_function_runtime,
    'on-event': (plan: DBPlan) => plan.on_event_function_runtime
};

export async function getFleetId(nangoProps: NangoProps): Promise<Result<string | undefined>> {
    if (!nangoProps.plan) {
        return Promise.resolve(Ok(envs.RUNNER_FLEET_ID));
    }
    const runtime = runtimeSelectors[nangoProps.scriptType](nangoProps.plan);
    switch (runtime) {
        case 'lambda':
            return Promise.resolve(Ok(envs.RUNNER_LAMBDA_FLEET_ID));
        default:
            return Promise.resolve(Ok(envs.RUNNER_FLEET_ID));
    }
}
