import { getLogger, metrics } from '@nangohq/utils';

import type { NangoRedisClient } from './redisClient.js';

export interface SlidingWindowRateLimiterOptions {
    keyPrefix: string;
    /** Default limit for every key. null leaves keys unlimited unless consume() passes a limit. */
    limit: number | null;
    windowMs: number;
}

export interface SlidingWindowConsumeOptions {
    /** Limit for this key, replacing the limiter default. undefined keeps the default, null makes the key unlimited. */
    limit?: number | null | undefined;
}

export interface SlidingWindowRateLimitResult {
    admitted: number;
    rejected: number;
    remaining: number | null;
    estimatedUsage: number | null;
    /** Approximate delay until the weighted estimate has room for one unit. */
    retryAfterMs: number;
    /** Limit applied to this call, null when the key is unlimited. */
    limit: number | null;
}

export interface SlidingWindowRateLimiter {
    consume(key: string, units: number, opts?: SlidingWindowConsumeOptions): Promise<SlidingWindowRateLimitResult>;
    destroy(): Promise<void>;
}

interface InMemoryWindow {
    index: number;
    current: number;
    previous: number;
    expiresAt: number;
}

const logger = getLogger('kvstore.slidingWindowRateLimiter');
const REDIS_KEY_PREFIX = 'sliding-window-rate-limit';

// Approximate the rolling window by weighting the previous fixed-window count
// by the fraction of the current window that remains.
const CONSUME_SLIDING_WINDOW = `
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local requested = tonumber(ARGV[3])

local redis_time = redis.call('TIME')
local now_ms = tonumber(redis_time[1]) * 1000 + math.floor(tonumber(redis_time[2]) / 1000)
local window_index = math.floor(now_ms / window_ms)
local state = redis.call('HMGET', KEYS[1], 'index', 'current', 'previous')
local stored_index = tonumber(state[1])
local current = tonumber(state[2]) or 0
local previous = tonumber(state[3]) or 0
local needs_expire = stored_index ~= window_index

if stored_index == nil or window_index < stored_index or window_index > stored_index + 1 then
  current = 0
  previous = 0
elseif window_index == stored_index + 1 then
  previous = current
  current = 0
end

local elapsed_ms = now_ms - window_index * window_ms
local remaining_window_ms = window_ms - elapsed_ms
local estimated_numerator = previous * remaining_window_ms + current * window_ms
local available = math.max(0, math.floor((limit * window_ms - estimated_numerator) / window_ms))
local admitted = math.min(requested, available)

current = current + admitted
estimated_numerator = estimated_numerator + admitted * window_ms

redis.call('HSET', KEYS[1], 'index', window_index, 'current', current, 'previous', previous)
if needs_expire then
  redis.call('PEXPIRE', KEYS[1], window_ms * 2)
end

return { admitted, estimated_numerator, remaining_window_ms, current, previous }
`;

function validateOptions(options: SlidingWindowRateLimiterOptions): void {
    if (options.keyPrefix.length === 0) {
        throw new Error('keyPrefix must not be empty');
    }
    if (options.keyPrefix.includes('{') || options.keyPrefix.includes('}')) {
        throw new Error('keyPrefix must not contain braces');
    }
    validatePositiveInteger(options.windowMs, 'windowMs');
    if (options.limit !== null) {
        validateLimit(options.limit, options.windowMs);
    }
    if (!Number.isSafeInteger(options.windowMs * 2)) {
        throw new Error('windowMs multiplied by 2 must be a safe integer');
    }
}

function validateConsume(key: string, units: number): void {
    if (key.length === 0) {
        throw new Error('key must not be empty');
    }
    validatePositiveInteger(units, 'units');
}

function validateLimit(limit: number, windowMs: number): void {
    validatePositiveInteger(limit, 'limit');
    if (!Number.isSafeInteger(limit * windowMs)) {
        throw new Error('limit multiplied by windowMs must be a safe integer');
    }
}

/**
 * Pick the limit for a single consume() call and validate it, so a bad override fails loudly
 * instead of silently letting everything through.
 */
function resolveLimit(defaultLimit: number | null, windowMs: number, opts: SlidingWindowConsumeOptions | undefined): number | null {
    const limit = opts?.limit === undefined ? defaultLimit : opts.limit;
    if (limit !== null) {
        validateLimit(limit, windowMs);
    }
    return limit;
}

function unlimited(units: number): SlidingWindowRateLimitResult {
    return { admitted: units, rejected: 0, remaining: null, estimatedUsage: null, retryAfterMs: 0, limit: null };
}

function validatePositiveInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive safe integer`);
    }
}

function result(requested: number, admitted: number, estimatedUsage: number | null, limit: number, retryAfterMs = 0): SlidingWindowRateLimitResult {
    return {
        admitted,
        rejected: requested - admitted,
        remaining: estimatedUsage === null ? null : Math.max(0, limit - estimatedUsage),
        estimatedUsage,
        retryAfterMs,
        limit
    };
}

function rotateWindow(window: InMemoryWindow | undefined, windowIndex: number, expiresAt: number): InMemoryWindow {
    if (!window || windowIndex < window.index || windowIndex > window.index + 1) {
        return { index: windowIndex, current: 0, previous: 0, expiresAt };
    }
    if (windowIndex === window.index + 1) {
        return { index: windowIndex, current: 0, previous: window.current, expiresAt };
    }
    return { ...window, expiresAt };
}

function getRetryAfterMs({
    limit,
    windowMs,
    remainingWindowMs,
    current,
    previous,
    estimatedNumerator
}: {
    limit: number;
    windowMs: number;
    remainingWindowMs: number;
    current: number;
    previous: number;
    estimatedNumerator: number;
}): number {
    const neededNumerator = estimatedNumerator - (limit - 1) * windowMs;
    if (previous > 0) {
        const decayDelayMs = Math.ceil(neededNumerator / previous);
        if (decayDelayMs <= remainingWindowMs) {
            return Math.max(1, decayDelayMs);
        }
    }

    if (current < limit) {
        return Math.max(1, remainingWindowMs);
    }
    return Math.max(1, remainingWindowMs + Math.ceil(((current - limit + 1) * windowMs) / current));
}

export class InMemorySlidingWindowRateLimiter implements SlidingWindowRateLimiter {
    private readonly windows = new Map<string, InMemoryWindow>();
    private readonly cleanupTimer: NodeJS.Timeout;

    constructor(private readonly options: SlidingWindowRateLimiterOptions) {
        validateOptions(options);
        this.cleanupTimer = setInterval(() => this.clearExpired(), Math.min(options.windowMs, 10_000));
        this.cleanupTimer.unref();
    }

    public consume(key: string, units: number, opts?: SlidingWindowConsumeOptions): Promise<SlidingWindowRateLimitResult> {
        let limit: number | null;
        try {
            validateConsume(key, units);
            limit = resolveLimit(this.options.limit, this.options.windowMs, opts);
        } catch (err) {
            return Promise.reject(err);
        }
        if (limit === null) {
            return Promise.resolve(unlimited(units));
        }

        const now = Date.now();
        const windowIndex = Math.floor(now / this.options.windowMs);
        const remainingWindowMs = this.options.windowMs - (now - windowIndex * this.options.windowMs);
        const windowKey = `${limit}:${key}`;
        const window = rotateWindow(this.windows.get(windowKey), windowIndex, now + this.options.windowMs * 2);
        let estimatedNumerator = window.previous * remainingWindowMs + window.current * this.options.windowMs;
        const available = Math.max(0, Math.floor((limit * this.options.windowMs - estimatedNumerator) / this.options.windowMs));
        const admitted = Math.min(units, available);

        window.current += admitted;
        estimatedNumerator += admitted * this.options.windowMs;
        this.windows.set(windowKey, window);

        const estimatedUsage = Math.ceil(estimatedNumerator / this.options.windowMs);
        const retryAfterMs =
            admitted < units
                ? getRetryAfterMs({
                      limit,
                      windowMs: this.options.windowMs,
                      remainingWindowMs,
                      current: window.current,
                      previous: window.previous,
                      estimatedNumerator
                  })
                : 0;

        metrics.distribution(metrics.Types.KVSTORE_SLIDING_WINDOW_USAGE, estimatedUsage);
        return Promise.resolve(result(units, admitted, estimatedUsage, limit, retryAfterMs));
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

    public async consume(key: string, units: number, opts?: SlidingWindowConsumeOptions): Promise<SlidingWindowRateLimitResult> {
        validateConsume(key, units);
        const limit = resolveLimit(this.options.limit, this.options.windowMs, opts);
        if (limit === null) {
            return unlimited(units);
        }

        let estimatedUsage: number;
        let rateLimitResult: SlidingWindowRateLimitResult;
        try {
            const client = typeof this.client === 'function' ? await this.client() : this.client;
            const response = await client.eval(CONSUME_SLIDING_WINDOW, {
                keys: [`${REDIS_KEY_PREFIX}:${this.options.keyPrefix.length}:{${this.options.keyPrefix}}:${limit}:${this.options.windowMs}:${key}`],
                arguments: [String(limit), String(this.options.windowMs), String(units)]
            });
            if (!Array.isArray(response) || response.length !== 5) {
                throw new Error('Unexpected Redis sliding window response');
            }

            const admitted = Number(response[0]);
            const estimatedNumerator = Number(response[1]);
            const remainingWindowMs = Number(response[2]);
            const current = Number(response[3]);
            const previous = Number(response[4]);
            if (![admitted, estimatedNumerator, remainingWindowMs, current, previous].every(Number.isSafeInteger)) {
                throw new Error('Invalid Redis sliding window response');
            }

            estimatedUsage = Math.ceil(estimatedNumerator / this.options.windowMs);
            const retryAfterMs =
                admitted < units
                    ? getRetryAfterMs({
                          limit,
                          windowMs: this.options.windowMs,
                          remainingWindowMs,
                          current,
                          previous,
                          estimatedNumerator
                      })
                    : 0;

            rateLimitResult = result(units, admitted, estimatedUsage, limit, retryAfterMs);
        } catch (err) {
            logger.error('Redis sliding window rate limiter failed. Admitting all requested units.', { error: err });
            metrics.increment(metrics.Types.KVSTORE_SLIDING_WINDOW_FAIL_OPEN);
            return result(units, units, null, limit);
        }

        metrics.distribution(metrics.Types.KVSTORE_SLIDING_WINDOW_USAGE, estimatedUsage);
        return rateLimitResult;
    }

    public async destroy(): Promise<void> {
        await this.destroyClient?.();
    }
}
