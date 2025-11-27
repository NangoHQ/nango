import { Fleet } from '@nangohq/fleet';
import { Err, Ok } from '@nangohq/utils';

import { LambdaRuntimeAdapter } from './lambda.adapter.js';
import { RunnerRuntimeAdapter } from './runner.adapter.js';
import { envs } from '../env.js';
import { runnersFleet } from '../runner/fleet.js';
import { lambdaNodeProvider } from '../runner/lambda.js';

import type { RuntimeAdapter } from './adapter.js';
import type { NangoProps } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

interface Runtime {
    readonly adapter: RuntimeAdapter;
    readonly fleet: Fleet;
}

const runtimes: Runtime[] = [
    {
        adapter: new LambdaRuntimeAdapter(),
        fleet: new Fleet({ fleetId: `${envs.RUNNER_FLEET_ID}_lambda`, nodeProvider: lambdaNodeProvider })
    },
    {
        adapter: new RunnerRuntimeAdapter(),
        fleet: runnersFleet
    }
];

export async function getRuntimes(): Promise<Result<Runtime[]>> {
    return Promise.resolve(Ok(runtimes));
}

export async function getRuntimeAdapter(_nangoProps: NangoProps): Promise<Result<RuntimeAdapter>> {
    for (const runtime of runtimes) {
        if (runtime.adapter.canHandle(_nangoProps)) {
            return Promise.resolve(Ok(runtime.adapter));
        }
    }
    return Promise.resolve(Err('No runtime adapter found'));
}

export async function startFleets(): Promise<Result<void>> {
    for (const runtime of runtimes) {
        runtime.fleet.start();
    }
    return Promise.resolve(Ok(undefined));
}

export async function stopFleets(): Promise<Result<void>> {
    for (const runtime of runtimes) {
        await runtime.fleet.stop();
    }
    return Promise.resolve(Ok(undefined));
}
