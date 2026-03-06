import { InMemoryKVStore, getKVStore } from '@nangohq/kvstore';

import { envs } from './env.js';
import { RunnerMonitor } from './monitor.js';
import { MapLocks } from './sdk/locks.js';

import type { KVStore } from '@nangohq/kvstore';

export const abortControllers = new Map<string, AbortController>();

let conflictTracker: KVStore;

if (envs.RUNNER_CONFLICT_RESOLUTION_MODE === 'REDIS') {
    conflictTracker = await getKVStore('customer');
} else {
    conflictTracker = new InMemoryKVStore();
}
export const usage = new RunnerMonitor({
    runnerId: envs.RUNNER_NODE_ID,
    conflictTracking: {
        tracker: conflictTracker,
        functionTypes: envs.RUNNER_CONFLICT_FUNCTION_TYPES
    }
});
export const locks = new MapLocks();
