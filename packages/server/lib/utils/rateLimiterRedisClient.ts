import { createClient } from 'redis';

import { getRedisClientOptions } from '@nangohq/kvstore';

export async function createRateLimiterRedisClient(url: string): Promise<ReturnType<typeof createClient>> {
    return createClient(getRedisClientOptions(url)).connect();
}
