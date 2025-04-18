import { RemoteRunner } from './remote.runner.js';
import { env, Err, isProd, Ok } from '@nangohq/utils';
import type { ProxyAppRouter } from '@nangohq/nango-runner';
import { envs } from '../env.js';
import type { Result } from '@nangohq/utils';
import { runnersFleet } from './fleet.js';
import { FleetRunner } from './fleet.runner.js';

export enum RunnerType {
    Remote = 'remote',
    Fleet = 'fleet'
}

export interface Runner {
    runnerType: RunnerType;
    id: string;
    client: ProxyAppRouter;
    url: string;
}

function getRunnerId(suffix: string): string {
    return `${env}-runner-account-${suffix}`;
}

export async function getRunner(teamId: number): Promise<Result<Runner>> {
    try {
        // a runner per account in prod only
        const runnerId = isProd ? getRunnerId(`${teamId}`) : getRunnerId('default');
        const runner = await getOrStartRunner(runnerId).catch(() => getOrStartRunner(getRunnerId('default')));
        return Ok(runner);
    } catch (err) {
        return Err(new Error(`Failed to get runner for team ${teamId}`, { cause: err }));
    }
}

export async function idle(nodeId: number): Promise<Result<void>> {
    const idle = await runnersFleet.idleNode({ nodeId });
    if (idle.isErr()) {
        return Err(idle.error);
    }
    return Ok(undefined);
}

async function getOrStartRunner(runnerId: string): Promise<Runner> {
    if (envs.RUNNER_TYPE === 'REMOTE') {
        return RemoteRunner.getOrStart(runnerId);
    }
    const getNode = await runnersFleet.getRunningNode(runnerId);
    if (getNode.isErr()) {
        throw new Error(`Failed to get running node for runner '${runnerId}'`);
    }
    const node = getNode.value;
    if (!node.url) {
        throw new Error(`Node url is missing for runner '${runnerId}'`);
    }
    return new FleetRunner(runnerId, node.url);
}
