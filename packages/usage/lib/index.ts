import { getRedis } from '@nangohq/kvstore';

import { UsageTracker, UsageTrackerNoOps } from './usage.js';

import type { IUsageTracker } from './usage.js';

export type { IUsageTracker as Usage } from './usage.js';
export { Capping } from './capping.js';
export type { ClickhouseRawUsageEvent } from './clickhouse/clickhouse.js';
export { Clickhouse } from './clickhouse/clickhouse.js';
export {
    AVG_METRICS,
    BREAKDOWN_DIMENSIONS,
    COUNTER_METRICS,
    FILTER_PARAM_TYPE_FOR_DIM,
    TOP_N_BREAKDOWN_CAP,
    TOP_N_BREAKDOWN_DEFAULT
} from './clickhouse/clickhouse.query.js';
export { clickhouseClient } from './clickhouse/config.js';
export { migrate } from './clickhouse/migrate.js';

export async function getUsageTracker(redisUrl: string | undefined): Promise<IUsageTracker> {
    if (redisUrl) {
        const redis = await getRedis(redisUrl);
        return new UsageTracker(redis);
    }
    return new UsageTrackerNoOps();
}
