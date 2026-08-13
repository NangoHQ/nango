import { randomUUID } from 'node:crypto';

import { getLogger, metrics } from '@nangohq/utils';

import type { NangoRedisClient } from './redisClient.js';

export interface SlidingWindowRateLimiterOptions {
    keyPrefix: string;
    limit: number;
    windowMs: number;
}

export interface SlidingWindowRateLimitResult {
    admitted: number;
    rejected: number;
    remaining: number | null;
    currentUsage: number | null;
    retryAfterMs: number;
}

export interface SlidingWindowRateLimiter {
    consume(key: string, units: number): Promise<SlidingWindowRateLimitResult>;
    destroy(): Promise<void>;
}

interface InMemoryWindow {
    timestamps: number[];
    expiresAt: number;
}

const logger = getLogger('kvstore.slidingWindowRateLimiter');
const REDIS_KEY_PREFIX = 'sliding-window-rate-limit';

const CONSUME_SLIDING_WINDOW = `
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local requested = tonumber(ARGV[3])
local member_prefix = ARGV[4]

local redis_time = redis.call('TIME')
local now_ms = tonumber(redis_time[1]) * 1000 + math.floor(tonumber(redis_time[2]) / 1000)
local cutoff = now_ms - window_ms

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)

local current = redis.call('ZCARD', KEYS[1])
local available = math.max(0, limit - current)
local admitted = math.min(requested, available)

for i = 1, admitted do
  redis.call('ZADD', KEYS[1], now_ms, member_prefix .. ':' .. i)
end

current = current + admitted
redis.call('PEXPIRE', KEYS[1], window_ms)

local retry_after_ms = 0
if admitted < requested then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  if #oldest > 0 then
    retry_after_ms = math.max(1, tonumber(oldest[2]) + window_ms - now_ms)
  end
end

return { admitted, current, retry_after_ms }
`;

function validateOptions(options: SlidingWindowRateLimiterOptions): void {
    if (options.keyPrefix.length === 0) {
        throw new Error('keyPrefix must not be empty');
    }
    if (options.keyPrefix.includes('{') || options.keyPrefix.includes('}')) {
        throw new Error('keyPrefix must not contain braces');
    }
    validatePositiveInteger(options.limit, 'limit');
    validatePositiveInteger(options.windowMs, 'windowMs');
}

function validateConsume(key: string, units: number): void {
    if (key.length === 0) {
        throw new Error('key must not be empty');
    }
    validatePositiveInteger(units, 'units');
}

function validatePositiveInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive safe integer`);
    }
}

function result(requested: number, admitted: number, currentUsage: number | null, limit: number, retryAfterMs = 0): SlidingWindowRateLimitResult {
    return {
        admitted,
        rejected: requested - admitted,
        remaining: currentUsage === null ? null : Math.max(0, limit - currentUsage),
        currentUsage,
        retryAfterMs
    };
}

function recordCardinality(currentUsage: number): void {
    try {
        metrics.distribution(metrics.Types.KVSTORE_SLIDING_WINDOW_CARDINALITY, currentUsage);
    } catch (err) {
        logger.error('Failed to record sliding window rate limiter cardinality.', { error: err });
    }
}

function recordFailOpen(): void {
    try {
        metrics.increment(metrics.Types.KVSTORE_SLIDING_WINDOW_FAIL_OPEN);
    } catch (err) {
        logger.error('Failed to record sliding window rate limiter fail-open.', { error: err });
    }
}

export class InMemorySlidingWindowRateLimiter implements SlidingWindowRateLimiter {
    private readonly windows = new Map<string, InMemoryWindow>();
    private readonly cleanupTimer: NodeJS.Timeout;

    constructor(private readonly options: SlidingWindowRateLimiterOptions) {
        validateOptions(options);
        this.cleanupTimer = setInterval(() => this.clearExpired(), Math.min(options.windowMs, 10_000));
        this.cleanupTimer.unref();
    }

    public consume(key: string, units: number): Promise<SlidingWindowRateLimitResult> {
        try {
            validateConsume(key, units);
        } catch (err) {
            return Promise.reject(err);
        }

        const now = Date.now();
        const cutoff = now - this.options.windowMs;
        const window = this.windows.get(key);
        const timestamps = window?.timestamps.filter((timestamp) => timestamp > cutoff) ?? [];
        const admitted = Math.min(units, Math.max(0, this.options.limit - timestamps.length));

        for (let i = 0; i < admitted; i++) {
            timestamps.push(now);
        }

        const currentUsage = timestamps.length;
        this.windows.set(key, { timestamps, expiresAt: now + this.options.windowMs });
        const retryAfterMs = admitted < units && timestamps[0] !== undefined ? Math.max(1, timestamps[0] + this.options.windowMs - now) : 0;

        recordCardinality(currentUsage);
        return Promise.resolve(result(units, admitted, currentUsage, this.options.limit, retryAfterMs));
    }

    public destroy(): Promise<void> {
        clearInterval(this.cleanupTimer);
        this.windows.clear();
        return Promise.resolve();
    }

    private clearExpired(): void {
        const now = Date.now();
        for (const [key, window] of this.windows) {
            if (window.expiresAt <= now) {
                this.windows.delete(key);
            }
        }
    }
}

export class RedisSlidingWindowRateLimiter implements SlidingWindowRateLimiter {
    constructor(
        private readonly client: NangoRedisClient | (() => Promise<NangoRedisClient>),
        private readonly options: SlidingWindowRateLimiterOptions,
        private readonly destroyClient?: () => Promise<void>
    ) {
        validateOptions(options);
    }

    public async consume(key: string, units: number): Promise<SlidingWindowRateLimitResult> {
        validateConsume(key, units);

        try {
            const client = typeof this.client === 'function' ? await this.client() : this.client;
            const response = await client.eval(CONSUME_SLIDING_WINDOW, {
                keys: [
                    `${REDIS_KEY_PREFIX}:${this.options.keyPrefix.length}:{${this.options.keyPrefix}}:${this.options.limit}:${this.options.windowMs}:${key}`
                ],
                arguments: [String(this.options.limit), String(this.options.windowMs), String(units), randomUUID()]
            });
            if (!Array.isArray(response) || response.length !== 3) {
                throw new Error('Unexpected Redis sliding window response');
            }

            const admitted = Number(response[0]);
            const currentUsage = Number(response[1]);
            const retryAfterMs = Number(response[2]);
            if (![admitted, currentUsage, retryAfterMs].every(Number.isSafeInteger)) {
                throw new Error('Invalid Redis sliding window response');
            }

            recordCardinality(currentUsage);
            return result(units, admitted, currentUsage, this.options.limit, retryAfterMs);
        } catch (err) {
            logger.error('Redis sliding window rate limiter failed. Admitting all requested units.', { error: err });
            recordFailOpen();
            return result(units, units, null, this.options.limit);
        }
    }

    public async destroy(): Promise<void> {
        await this.destroyClient?.();
    }
}
