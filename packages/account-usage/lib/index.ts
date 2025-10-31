import { getRedis } from '@nangohq/kvstore';

import { Capping } from './capping.js';
import { UsageTracker, UsageTrackerNoOps } from './usage.js';

import type { IUsageTracker } from './usage.js';

export type { IUsageTracker as Usage } from './usage.js';
export type { Capping } from './capping.js';

export async function getUsageTracker(redisUrl: string | undefined): Promise<IUsageTracker> {
    if (redisUrl) {
        const redis = await getRedis(redisUrl);
        return new UsageTracker(redis);
    }
    return new UsageTrackerNoOps();
}

export async function getCapping(redisUrl: string | undefined, options: { enabled: boolean }): Promise<Capping> {
    const usageTracker = await getUsageTracker(redisUrl);
    return new Capping(usageTracker, options);
}
