import { InMemoryKVStore, getKVStore } from '@nangohq/kvstore';

import { envs } from './env.js';
import { RunnerMonitor } from './monitor.js';
import { MapLocks } from './sdk/locks.js';

import type { KVStore } from '@nangohq/kvstore';

export const abortControllers = new Map<string, AbortController>();

export const abortViaRedis = envs.RUNNER_CONFLICT_RESOLUTION_MODE === 'REDIS';

let kvStoreInstance: KVStore;
if (envs.RUNNER_CONFLICT_RESOLUTION_MODE === 'REDIS') {
    kvStoreInstance = await getKVStore('customer');
} else {
    kvStoreInstance = new InMemoryKVStore();
}
export const kvStore = kvStoreInstance;
export const usage = new RunnerMonitor({
    runnerId: envs.RUNNER_NODE_ID,
    conflictTracking: {
        tracker: kvStoreInstance
    }
});
export const locks = new MapLocks();
