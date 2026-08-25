import { describe, expect, it, vi } from 'vitest';

import { seeders } from '@nangohq/shared';

import { getFleetId } from './runtimes.rules.js';

import type { DBPlan, NangoProps, RoutingContext } from '@nangohq/types';

const mockEnvs = {
    RUNNER_FLEET_ID: 'runner-fleet',
    RUNNER_LAMBDA_FLEET_ID: 'lambda-fleet'
};

vi.mock('../env.js', () => ({
    get envs() {
        return mockEnvs;
    }
}));

function nango(scriptType: NangoProps['scriptType']): NangoProps {
    return { scriptType } as NangoProps;
}

function routing(plan: DBPlan | null, features: RoutingContext['features']): RoutingContext {
    return { plan, features };
}

describe('getFleetId', () => {
    it('returns runner fleet when there is no plan', async () => {
        const res = await getFleetId({
            nangoProps: nango('sync'),
            routingContext: routing(null, [])
        });
        expect(res.unwrap()).toBe(mockEnvs.RUNNER_FLEET_ID);
    });

    it('returns lambda fleet for sync on lambda runtime when checkpoint requirement is disabled', async () => {
        const plan = seeders.getTestPlan({
            sync_function_runtime: 'lambda',
            sync_lambda_checkpoint_required: false
        });
        const res = await getFleetId({
            nangoProps: nango('sync'),
            routingContext: routing(plan, [])
        });
        expect(res.unwrap()).toBe(mockEnvs.RUNNER_LAMBDA_FLEET_ID);
    });

    it('returns runner fleet for sync on lambda runtime when checkpoints are required and missing', async () => {
        const plan = seeders.getTestPlan({
            sync_function_runtime: 'lambda',
            sync_lambda_checkpoint_required: true
        });
        const res = await getFleetId({
            nangoProps: nango('sync'),
            routingContext: routing(plan, [])
        });
        expect(res.unwrap()).toBe(mockEnvs.RUNNER_FLEET_ID);
    });

    it('returns lambda fleet for sync on lambda runtime when checkpoints feature is present', async () => {
        const plan = seeders.getTestPlan({
            sync_function_runtime: 'lambda',
            sync_lambda_checkpoint_required: true
        });
        const res = await getFleetId({
            nangoProps: nango('sync'),
            routingContext: routing(plan, ['checkpoints'])
        });
        expect(res.unwrap()).toBe(mockEnvs.RUNNER_LAMBDA_FLEET_ID);
    });

    it('returns lambda fleet for action on lambda runtime without checkpoints', async () => {
        const plan = seeders.getTestPlan({
            action_function_runtime: 'lambda',
            sync_function_runtime: 'runner'
        });
        const res = await getFleetId({
            nangoProps: nango('action'),
            routingContext: routing(plan, [])
        });
        expect(res.unwrap()).toBe(mockEnvs.RUNNER_LAMBDA_FLEET_ID);
    });
});
