import { getKVStore } from '@nangohq/kvstore';

import { DbUsageStore } from './usageStore/dbUsageStore.js';
import { HybridUsageStore } from './usageStore/hybridUsageStore.js';
import { KvUsageStore } from './usageStore/kvUsageStore.js';
import { UsageTracker } from './usageTracker.js';

export { UsageTracker } from './usageTracker.js';
export type { UsageStore } from './usageStore/usageStore.js';
export { KvUsageStore } from './usageStore/kvUsageStore.js';
export { HybridUsageStore } from './usageStore/hybridUsageStore.js';

let usageTracker: UsageTracker | undefined;

async function createUsageTracker(): Promise<UsageTracker> {
    const kvStore = await getKVStore();
    const kvUsageStore = new KvUsageStore(kvStore);
    const persistentUsageStore = new DbUsageStore();
    const usageStore = new HybridUsageStore(kvUsageStore, persistentUsageStore);
    return new UsageTracker(usageStore);
}

export async function getUsageTracker(): Promise<UsageTracker> {
    if (usageTracker) {
        return usageTracker;
    }

    usageTracker = await createUsageTracker();
    return usageTracker;
}
