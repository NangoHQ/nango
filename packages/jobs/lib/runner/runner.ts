import { LocalRunner } from './local.runner.js';
import { RenderRunner } from './render.runner.js';
import { RemoteRunner } from './remote.runner.js';
import { isEnterprise, env, getLogger } from '@nangohq/utils';
import type { ProxyAppRouter } from '@nangohq/nango-runner';
import type { KVStore } from '@nangohq/kvstore';
import { createKVStore } from '@nangohq/kvstore';

const logger = getLogger('Runner');

export enum RunnerType {
    Local = 'local',
    Render = 'render',
    Remote = 'remote'
}

export interface Runner {
    runnerType: RunnerType;
    id: string;
    client: ProxyAppRouter;
    url: string;
    suspend(): Promise<void> | void;
    toJSON(): Record<string, any>;
}

export function getRunnerId(suffix: string): string {
    return `${env}-runner-account-${suffix}`;
}

export async function getOrStartRunner(runnerId: string): Promise<Runner> {
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
    const isRender = process.env['IS_RENDER'] === 'true';
    let runner: Runner;
    if (isRender) {
        runner = await RenderRunner.getOrStart(runnerId);
    } else {
        runner = await LocalRunner.getOrStart(runnerId);
    }

    await waitForRunner(runner);
    await runnersCache.set(runner);
    return runner;
}

export async function suspendRunner(runnerId: string): Promise<void> {
    const isRender = process.env['IS_RENDER'] === 'true';
    if (isRender) {
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
