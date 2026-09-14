import { getInternalAuthBearerHeaderIfPresent } from '@nangohq/internal-auth';
import { env, Err, isProd, Ok, retryWithBackoff, withInternalTls } from '@nangohq/utils';

import { envs } from '../env.js';
import { mintRunnerDispatchToken } from '../internal-auth.js';
import { getDefaultFleet } from '../runtime/runtimes.js';
import { FleetRunner } from './fleet.runner.js';
import { RemoteRunner } from './remote.runner.js';

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

function getRunnerIdForTeam(teamId: number): string {
    return isProd ? getRunnerId(`${teamId}`) : getRunnerId('default');
}

type RunnerAuthOpts = { token?: string | null | undefined };

export async function getRunner(teamId: number, auth?: RunnerAuthOpts): Promise<Result<Runner>> {
    try {
        const runnerId = getRunnerIdForTeam(teamId);
        const runner = await getOrStartRunner(runnerId, auth?.token).catch(() => getOrStartRunner(getRunnerId('default'), auth?.token));
        return Ok(runner);
    } catch (err) {
        return Err(new Error(`Failed to get runner for team ${teamId}`, { cause: err }));
    }
}

export async function getRunners(teamId: number, auth?: RunnerAuthOpts): Promise<Result<Runner[]>> {
    try {
        const runnerId = getRunnerIdForTeam(teamId);
        if (envs.RUNNER_TYPE === 'REMOTE') {
            const runner = await getOrStartRunner(runnerId, auth?.token).catch(() => getOrStartRunner(getRunnerId('default'), auth?.token));
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

        const runners = nodes.value.filter((node) => node.url).map((node) => new FleetRunner(runnerId, node.url as string, auth?.token));
        if (runners.length > 0) {
            return Ok(runners);
        }

        const runner = await getOrStartRunner(runnerId, auth?.token).catch(() => getOrStartRunner(getRunnerId('default'), auth?.token));
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
            const token = mintRunnerDispatchToken({ nodeId: String(node.id) });
            return await fetch(
                `${node.url}/notifyWhenIdle`,
                withInternalTls({
                    method: 'POST',
                    body: JSON.stringify({ nodeId: node.id }),
                    headers: getInternalAuthBearerHeaderIfPresent(token)
                })
            );
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

async function getOrStartRunner(runnerId: string, token?: string | null): Promise<Runner> {
    if (envs.RUNNER_TYPE === 'REMOTE') {
        return RemoteRunner.getOrStart(runnerId, token);
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
    return new FleetRunner(runnerId, node.url, token);
}
