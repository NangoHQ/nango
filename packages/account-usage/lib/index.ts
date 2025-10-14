import { getKVStore, getRedis } from '@nangohq/kvstore';

import { DbAccountUsageStore } from './accountUsageStore/dbAccountUsageStore.js';
import { HybridAccountUsageStore } from './accountUsageStore/hybridAccountUsageStore.js';
import { KvAccountUsageStore } from './accountUsageStore/kvAccountUsageStore.js';
import { AccountUsageTracker } from './accountUsageTracker.js';
import { UsageTracker, UsageTrackerNoOps } from './usage.js';

import type { Usage } from './usage.js';

export { AccountUsageTracker } from './accountUsageTracker.js';
export type { AccountUsageStore } from './accountUsageStore/accountUsageStore.js';
export { DbAccountUsageStore } from './accountUsageStore/dbAccountUsageStore.js';
export { HybridAccountUsageStore } from './accountUsageStore/hybridAccountUsageStore.js';
export { KvAccountUsageStore } from './accountUsageStore/kvAccountUsageStore.js';
export { onUsageIncreased } from './events/onUsageIncreased.js';

let usageTracker: AccountUsageTracker | undefined;

/**
 * Creates an AccountUsageTracker with a HybridAccountUsageStore.
 * Focused on performance over precision.
 * Intended for simple local account usage tracking, not for billing.
 */
async function createAccountUsageTracker(): Promise<AccountUsageTracker> {
    const kvStore = await getKVStore();
    const kvUsageStore = new KvAccountUsageStore(kvStore);
    const persistentUsageStore = new DbAccountUsageStore();
    const usageStore = new HybridAccountUsageStore(kvUsageStore, persistentUsageStore);
    return new AccountUsageTracker(usageStore);
}

export async function getAccountUsageTracker(): Promise<AccountUsageTracker> {
    if (usageTracker) {
        return usageTracker;
    }

    usageTracker = await createAccountUsageTracker();
    return usageTracker;
}

export type { Usage } from './usage.js';

export async function getUsageTracker(redisUrl: string | undefined): Promise<Usage> {
    if (redisUrl) {
        const redis = await getRedis(redisUrl);
        return new UsageTracker(redis);
    }
    return new UsageTrackerNoOps();
}
