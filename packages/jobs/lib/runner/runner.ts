import type { KVStore } from '@nangohq/shared/lib/utils/kvstore/KVStore.js';
import { LocalRunner } from './local.runner.js';
import { RenderRunner } from './render.runner.js';
import { getEnv, getRedisUrl, InMemoryKVStore, RedisKVStore } from '@nangohq/shared';
import type { ProxyAppRouter } from '@nangohq/nango-runner';

export enum RunnerType {
    Local = 'local',
    Render = 'render'
}

export interface Runner {
    runnerType: RunnerType;
    id: string;
    client: ProxyAppRouter;
    url: string;
    suspend(): Promise<void>;
    toJSON(): any;
}

export function getRunnerId(suffix: string): string {
    return `${getEnv()}-runner-account-${suffix}`;
}

export async function getOrStartRunner(runnerId: string): Promise<Runner> {
    const waitForRunner = async function (runner: Runner): Promise<void> {
        const timeoutMs = 5000;
        let healthCheck = false;
        const startTime = Date.now();
        while (!healthCheck && Date.now() - startTime < timeoutMs) {
            try {
                await runner.client.health.query();
                healthCheck = true;
            } catch (err) {
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
        } catch (err) {}
    }
    const isRender = process.env['IS_RENDER'] === 'true';
    const runner = isRender ? await RenderRunner.getOrStart(runnerId) : await LocalRunner.getOrStart(runnerId);
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
                }
            }
            return undefined;
        } catch (err) {
            return undefined;
        }
    }

    async set(runner: Runner): Promise<void> {
        const ttl = 7 * 24 * 60 * 60 * 1000; // 7 days
        await this.store.set(this.cacheKey(runner.id), JSON.stringify(runner), true, ttl);
    }

    async delete(runnerId: string): Promise<void> {
        await this.store.delete(runnerId);
    }
}

const runnersCache = await (async () => {
    let store: KVStore;
    const url = getRedisUrl();
    if (url) {
        store = new RedisKVStore(url);
        await (store as RedisKVStore).connect();
    } else {
        store = new InMemoryKVStore();
    }
    return new RunnerCache(store);
})();
