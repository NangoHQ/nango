import { LocalRunner } from './local.runner.js';
import { RenderRunner } from './render.runner.js';
import { RemoteRunner } from './remote.runner.js';
import { isEnterprise, env, Err, isProd, Ok } from '@nangohq/utils';
import type { ProxyAppRouter } from '@nangohq/nango-runner';
import type { KVStore } from '@nangohq/kvstore';
import { createKVStore } from '@nangohq/kvstore';
import { envs } from '../env.js';
import type { Result } from '@nangohq/utils';
import { logger } from '../logger.js';
import { featureFlags } from '@nangohq/shared';
import { runnersFleet } from './fleet.js';
import { FleetRunner } from './fleet.runner.js';

export enum RunnerType {
    // TODO: DEPRECATE Local and Render
    Local = 'local',
    Render = 'render',
    Remote = 'remote',
    Fleet = 'fleet'
}

export interface Runner {
    runnerType: RunnerType;
    id: string;
    client: ProxyAppRouter;
    url: string;
    // TODO: DEPRECATE
    suspend(): Promise<void> | void;
    toJSON(): Record<string, any>;
}

function getRunnerId(suffix: string): string {
    return `${env}-runner-account-${suffix}`;
}

export async function getRunner(teamId: number): Promise<Result<Runner>> {
    try {
        // a runner per account in prod only
        const runnerId = isProd ? getRunnerId(`${teamId}`) : getRunnerId('default');

        const isFleetGloballyEnabled = await featureFlags.isEnabled('fleet', 'global', false);
        const isFleetEnabledForTeam = await featureFlags.isEnabled('fleet', `${teamId}`, false);
        const isFleetEnabled = isFleetGloballyEnabled || isFleetEnabledForTeam;
        if (isFleetEnabled) {
            const runner = await getOrStartRunner(runnerId).catch(() => getOrStartRunner(getRunnerId('default')));
            return Ok(runner);
        }

        // fallback to default runner if account runner isn't ready yet
        const runner = await getOrStartRunnerLegacy(runnerId).catch(() => getOrStartRunnerLegacy(getRunnerId('default')));
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

// TODO: DEPRECATE
async function getOrStartRunnerLegacy(runnerId: string): Promise<Runner> {
    const waitForRunner = async function (runner: Runner): Promise<void> {
        const timeoutMs = isEnterprise ? 60000 : 5000;
        let healthCheck = false;
        const startTime = Date.now();
        while (!healthCheck && Date.now() - startTime < timeoutMs) {
            try {
                await runner.client.health.query();
                healthCheck = true;
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
        if (!healthCheck) {
            throw new Error(`Runner '${runnerId}' hasn't started after ${timeoutMs}ms,`);
        }
    };

    const cachedRunner = await runnersCache.get(runnerId);
    if (cachedRunner) {
        try {
            await waitForRunner(cachedRunner);
            return cachedRunner;
        } catch (err) {
            logger.error(err);
        }
    }
    let runner: Runner;
    switch (envs.RUNNER_TYPE) {
        case 'LOCAL':
            runner = await LocalRunner.getOrStart(runnerId);
            break;
        case 'REMOTE':
            runner = await RemoteRunner.getOrStart(runnerId);
            break;
        case 'RENDER':
            runner = await RenderRunner.getOrStart(runnerId);
            break;
    }

    await waitForRunner(runner);
    await runnersCache.set(runner);
    return runner;
}

export async function suspendRunner(runnerId: string): Promise<void> {
    if (envs.RUNNER_TYPE === 'RENDER') {
        // we only suspend render runners
        const runner = await RenderRunner.get(runnerId);
        if (runner) {
            await runner.suspend();
        }
    }
    await runnersCache.delete(runnerId);
}

// Caching the runners to minimize calls made to Render api
// and to better handle Render rate limits and potential downtime

class RunnerCache {
    constructor(private readonly store: KVStore) {}

    private cacheKey(s: string): string {
        return `jobs:runner:${s}`;
    }

    async get(runnerId: string): Promise<Runner | undefined> {
        try {
            const cached = await this.store.get(this.cacheKey(runnerId));
            if (cached) {
                const obj = JSON.parse(cached);
                switch (obj.runnerType) {
                    case RunnerType.Local:
                        return LocalRunner.fromJSON(obj);
                    case RunnerType.Render:
                        return RenderRunner.fromJSON(obj);
                    case RunnerType.Remote:
                        return RemoteRunner.fromJSON(obj);
                }
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    async set(runner: Runner): Promise<void> {
        const ttl = 7 * 24 * 60 * 60 * 1000; // 7 days
        await this.store.set(this.cacheKey(runner.id), JSON.stringify(runner), { canOverride: true, ttlInMs: ttl });
    }

    async delete(runnerId: string): Promise<void> {
        await this.store.delete(runnerId);
    }
}

const runnersCache = await (async () => {
    const store = await createKVStore();
    return new RunnerCache(store);
})();
