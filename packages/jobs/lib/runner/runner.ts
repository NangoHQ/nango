import { Err, Ok, env, isProd, retryWithBackoff } from '@nangohq/utils';

import { RemoteRunner } from './remote.runner.js';
import { envs } from '../env.js';
import { FleetRunner } from './fleet.runner.js';
import { getDefaultFleet } from '../runtime/runtimes.js';

import type { Node } from '@nangohq/fleet';
import type { ProxyAppRouter } from '@nangohq/nango-runner';
import type { Result } from '@nangohq/utils';

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

export const runnerHttpOpts = {
    headersTimeoutMs: envs.RUNNER_CLIENT_HEADERS_TIMEOUT_MS,
    connectTimeoutMs: envs.RUNNER_CLIENT_CONNECT_TIMEOUT_MS,
    responseTimeoutMs: envs.RUNNER_CLIENT_RESPONSE_TIMEOUT_MS
};

function getRunnerId(suffix: string): string {
    if (envs.RUNNER_TYPE === 'KUBERNETES') {
        suffix = `${suffix}-k8s`;
    }
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

export async function getRunners(teamId: number): Promise<Result<Runner[]>> {
    try {
        const runnerId = isProd ? getRunnerId(`${teamId}`) : getRunnerId('default');
        if (envs.RUNNER_TYPE === 'REMOTE') {
            const runner = await getOrStartRunner(runnerId);
            return Ok([runner]);
        }

        const runnersFleet = getDefaultFleet();
        const nodes = await runnersFleet.getNodesByRoutingId({
            routingId: runnerId,
            states: ['RUNNING', 'OUTDATED']
        });
        if (nodes.isErr()) {
            return Err(nodes.error);
        }

        const runners = nodes.value.filter((node) => node.url).map((node) => new FleetRunner(runnerId, node.url as string));
        if (runners.length > 0) {
            return Ok(runners);
        }

        const runner = await getOrStartRunner(runnerId).catch(() => getOrStartRunner(getRunnerId('default')));
        return Ok([runner]);
    } catch (err) {
        return Err(new Error(`Failed to get runners for team ${teamId}`, { cause: err }));
    }
}

export async function idle(nodeId: number): Promise<Result<void>> {
    const runnersFleet = getDefaultFleet();
    const idle = await runnersFleet.idleNode({ nodeId });
    if (idle.isErr()) {
        return Err(idle.error);
    }
    return Ok(undefined);
}

export async function notifyOnIdle(node: Node): Promise<Result<void>> {
    const res = await retryWithBackoff(
        async () => {
            return await fetch(`${node.url}/notifyWhenIdle`, { method: 'POST', body: JSON.stringify({ nodeId: node.id }) });
        },
        {
            numOfAttempts: 5
        }
    );
    if (!res.ok) {
        throw new Error(`status: ${res.status}. response: ${res.statusText}`);
    }
    return Ok(undefined);
}

async function getOrStartRunner(runnerId: string): Promise<Runner> {
    if (envs.RUNNER_TYPE === 'REMOTE') {
        return RemoteRunner.getOrStart(runnerId);
    }
    const runnersFleet = getDefaultFleet();
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
