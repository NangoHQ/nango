import { Fleet } from '@nangohq/fleet';
import { Err, Ok, useLambda } from '@nangohq/utils';

import { LambdaRuntimeAdapter } from './lambda.adapter.js';
import { RunnerRuntimeAdapter } from './runner.adapter.js';
import { envs } from '../env.js';
import { getFleetId } from './runtimes.rules.js';
import { logger } from '../logger.js';
import { runnersFleet } from '../runner/fleet.js';
import { lambdaNodeProvider } from '../runner/lambda.js';

import type { RuntimeAdapter } from './adapter.js';
import type { NangoProps } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

interface Runtime {
    readonly adapter: RuntimeAdapter;
    readonly fleet: Fleet;
}

const runtimes: Map<string, Runtime> = new Map<string, Runtime>();

if (useLambda) {
    const fleet = new Fleet({ fleetId: envs.RUNNER_LAMBDA_FLEET_ID, nodeProvider: lambdaNodeProvider });
    const adapter = new LambdaRuntimeAdapter(fleet);
    runtimes.set(fleet.fleetId, {
        adapter,
        fleet
    });
}

const defaultRuntime = {
    adapter: new RunnerRuntimeAdapter(),
    fleet: runnersFleet
};
runtimes.set(runnersFleet.fleetId, defaultRuntime);

export function getDefaultFleet(): Fleet {
    return runnersFleet;
}

export async function getRuntimeAdapter(nangoProps: NangoProps): Promise<Result<RuntimeAdapter>> {
    const result = await getFleetId(nangoProps);
    if (result.isErr()) {
        logger.error('Error while getting fleet id for runtime', result.error);
    } else {
        if (result.value) {
            const runtime = runtimes.get(result.value);
            if (runtime) return Ok(runtime.adapter);
        }
    }
    return Ok(defaultRuntime.adapter);
}

export async function startFleets(): Promise<Result<void>> {
    for (const runtime of runtimes.values()) {
        runtime.fleet.start();
    }
    return Promise.resolve(Ok(undefined));
}

export async function stopFleets(): Promise<Result<void>> {
    for (const runtime of runtimes.values()) {
        await runtime.fleet.stop();
    }
    return Promise.resolve(Ok(undefined));
}

export async function migrateFleets(): Promise<Result<void>> {
    for (const runtime of runtimes.values()) {
        await runtime.fleet.migrate();
    }
    return Promise.resolve(Ok(undefined));
}

export async function registerWithFleet(fleetId: string, params: { nodeId: number; url: string }): Promise<Result<void>> {
    const runtime = runtimes.get(fleetId);
    if (runtime) {
        const result = await runtime.fleet.registerNode(params);
        if (result.isErr()) {
            return Err(new Error(`Error registering node ${params.nodeId}`, { cause: result.error }));
        }
        return Ok(undefined);
    } else {
        return Err(new Error(`Error registering node ${params.nodeId}. No runtime found for fleetId ${fleetId}`));
    }
}
