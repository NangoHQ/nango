import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { getLogger, metrics, stringifyError } from '@nangohq/utils';

import type { NangoRedisClient } from '@nangohq/kvstore';

const logger = getLogger('jobs.webhook.dispatch-queue.capacity-coordinator');

/**
 * 1. Remove expired leases and initialize the shared capacity state.
 * 2. Return an existing lease for the same token, making retries safe.
 * 3. Reject acquisition while dispatch is paused or the current limit is full.
 * 4. Otherwise add a renewable lease and return the updated active count.
 */
const ACQUIRE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local leaseTtl = tonumber(ARGV[2])
local initialLimit = tonumber(ARGV[3])
local hardMaximum = tonumber(ARGV[4])
local leaseExpiresAt = now + leaseTtl

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
local existingLease = redis.call('ZSCORE', KEYS[1], ARGV[1])
if existingLease then
  redis.call('ZADD', KEYS[1], 'XX', leaseExpiresAt, ARGV[1])
  return {1, tonumber(redis.call('HGET', KEYS[2], 'limit') or tostring(initialLimit)), 0, redis.call('ZCARD', KEYS[1]), leaseExpiresAt}
end
redis.call('HSETNX', KEYS[2], 'limit', initialLimit)
redis.call('HSETNX', KEYS[2], 'slowStartThreshold', hardMaximum)
redis.call('HSETNX', KEYS[2], 'successes', 0)
redis.call('HSETNX', KEYS[2], 'lastDecreaseAt', 0)
redis.call('HSETNX', KEYS[2], 'pausedUntil', 0)

local limit = math.min(tonumber(redis.call('HGET', KEYS[2], 'limit')), hardMaximum)
redis.call('HSET', KEYS[2], 'limit', limit, 'hardMaximum', hardMaximum)
local pausedUntil = tonumber(redis.call('HGET', KEYS[2], 'pausedUntil'))
if pausedUntil > now then
  return {0, limit, pausedUntil - now, redis.call('ZCARD', KEYS[1]), 0}
end

local active = tonumber(redis.call('ZCARD', KEYS[1]))
if active >= limit then
  return {0, limit, 0, active, 0}
end

redis.call('ZADD', KEYS[1], 'NX', leaseExpiresAt, ARGV[1])
redis.call('PEXPIRE', KEYS[1], leaseTtl * 2)
redis.call('PEXPIRE', KEYS[2], 604800000)
return {1, limit, 0, active + 1, leaseExpiresAt}
`;

/**
 * 1. Check that the lease exists and has not expired.
 * 2. Remove and reject an expired lease so it cannot be revived.
 * 3. Otherwise extend the lease and its Redis key TTL.
 */
const RENEW_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local expiresAt = redis.call('ZSCORE', KEYS[1], ARGV[1])
if not expiresAt or tonumber(expiresAt) <= now then
  redis.call('ZREM', KEYS[1], ARGV[1])
  return 0
end
local renewedUntil = now + tonumber(ARGV[2])
redis.call('ZADD', KEYS[1], 'XX', renewedUntil, ARGV[1])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]) * 2)
return renewedUntil
`;

/**
 * 1. Remove expired leases and the caller's lease.
 * 2. Return the remaining active lease count for metrics.
 */
const RELEASE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREM', KEYS[1], ARGV[1])
return redis.call('ZCARD', KEYS[1])
`;

/**
 * 1. Remove expired leases and update the latency moving average.
 * 2. Count healthy results only while all available capacity is in use.
 * 3. After enough healthy results, grow the limit using slow start or additive growth.
 * 4. Reset growth progress when latency becomes unhealthy.
 */
const SUCCESS_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local duration = tonumber(ARGV[1])
local healthyLatency = tonumber(ARGV[2])
local hardMaximum = tonumber(ARGV[3])
local limit = math.min(tonumber(redis.call('HGET', KEYS[2], 'limit') or '1'), hardMaximum)
local previousLimit = limit
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
local active = tonumber(redis.call('ZCARD', KEYS[1]))

local previousEwma = tonumber(redis.call('HGET', KEYS[2], 'latencyEwmaMs') or tostring(duration))
local ewma = math.floor((previousEwma * 7 + duration) / 8)
redis.call('HSET', KEYS[2], 'latencyEwmaMs', ewma)

if duration <= healthyLatency and ewma <= healthyLatency and active >= limit then
  local successes = tonumber(redis.call('HINCRBY', KEYS[2], 'successes', 1))
  if successes >= limit and limit < hardMaximum then
    local threshold = tonumber(redis.call('HGET', KEYS[2], 'slowStartThreshold') or tostring(hardMaximum))
    if limit < threshold then
      limit = math.min(limit * 2, threshold, hardMaximum)
    else
      limit = math.min(limit + 1, hardMaximum)
    end
    redis.call('HSET', KEYS[2], 'limit', limit, 'successes', 0)
  end
elseif duration > healthyLatency or ewma > healthyLatency then
  redis.call('HSET', KEYS[2], 'successes', 0)
end

redis.call('HSET', KEYS[2], 'lastSuccessAt', now)
return {limit, previousLimit, ewma}
`;

/**
 * 1. Reduce the capacity limit at most once per control interval.
 * 2. Reset growth progress and set the new slow-start threshold.
 * 3. Extend the global dispatch pause through the requested retry time.
 */
const CONGESTION_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local minimum = tonumber(ARGV[1])
local hardMaximum = tonumber(ARGV[2])
local controlInterval = tonumber(ARGV[3])
local retryAfter = tonumber(ARGV[4])
local limit = math.min(tonumber(redis.call('HGET', KEYS[1], 'limit') or tostring(minimum)), hardMaximum)
local previousLimit = limit
local lastDecrease = tonumber(redis.call('HGET', KEYS[1], 'lastDecreaseAt') or '0')

if now - lastDecrease >= controlInterval then
  limit = math.max(minimum, math.floor(limit / 2))
  redis.call('HSET', KEYS[1], 'limit', limit, 'slowStartThreshold', limit, 'successes', 0, 'lastDecreaseAt', now)
end

local pausedUntil = tonumber(redis.call('HGET', KEYS[1], 'pausedUntil') or '0')
redis.call('HSET', KEYS[1], 'pausedUntil', math.max(pausedUntil, now + retryAfter))
return {limit, previousLimit}
`;

export interface DispatchCapacityPermit {
    isValid(): boolean;
    release(): Promise<void>;
}

export interface DispatchCapacityCoordinator {
    acquire(signal: AbortSignal): Promise<DispatchCapacityPermit>;
    recordSuccess(durationMs: number): Promise<void>;
    recordCongestion(retryAfterMs: number): Promise<void>;
    recordFailure(): Promise<void>;
}

interface RedisDispatchCapacityCoordinatorOptions {
    redis: NangoRedisClient;
    keyPrefix: string;
    initialLimit: number;
    hardMaximum: number;
    leaseTtlMs: number;
    acquireRetryMs: number;
    healthyLatencyMs: number;
    controlIntervalMs: number;
}

export class RedisDispatchCapacityCoordinator implements DispatchCapacityCoordinator {
    private readonly redis: NangoRedisClient;
    private readonly leasesKey: string;
    private readonly stateKey: string;
    private readonly initialLimit: number;
    private readonly hardMaximum: number;
    private readonly leaseTtlMs: number;
    private readonly acquireRetryMs: number;
    private readonly healthyLatencyMs: number;
    private readonly controlIntervalMs: number;

    constructor(options: RedisDispatchCapacityCoordinatorOptions) {
        if (options.initialLimit > options.hardMaximum) {
            throw new Error('Initial dispatch capacity must not exceed its hard maximum');
        }
        if (options.leaseTtlMs < 300) {
            throw new Error('Dispatch capacity lease TTL must be at least 300 ms');
        }
        this.redis = options.redis;
        this.leasesKey = `${options.keyPrefix}:leases`;
        this.stateKey = `${options.keyPrefix}:state`;
        this.initialLimit = options.initialLimit;
        this.hardMaximum = options.hardMaximum;
        this.leaseTtlMs = options.leaseTtlMs;
        this.acquireRetryMs = options.acquireRetryMs;
        this.healthyLatencyMs = options.healthyLatencyMs;
        this.controlIntervalMs = options.controlIntervalMs;
    }

    async acquire(signal: AbortSignal): Promise<DispatchCapacityPermit> {
        const token = randomUUID();
        const startedAt = Date.now();
        while (!signal.aborted) {
            try {
                const response = await this.redis.eval(ACQUIRE_SCRIPT, {
                    keys: [this.leasesKey, this.stateKey],
                    arguments: [token, String(this.leaseTtlMs), String(this.initialLimit), String(this.hardMaximum)]
                });
                const [acquired, limit, retryAfterMs, active, leaseExpiresAt] = response as number[];
                metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_CAPACITY_LIMIT, limit);
                metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_CAPACITY_ACTIVE, active);
                if (acquired === 1) {
                    const redisLeaseExpiresAt = Number(leaseExpiresAt);
                    if (!Number.isFinite(redisLeaseExpiresAt) || redisLeaseExpiresAt <= 0) {
                        throw new Error('Redis returned an invalid webhook dispatch capacity lease expiration');
                    }
                    metrics.duration(metrics.Types.WEBHOOK_DISPATCH_CAPACITY_PERMIT_WAIT_MS, Date.now() - startedAt);
                    return new RedisDispatchCapacityPermit({
                        redis: this.redis,
                        leasesKey: this.leasesKey,
                        token,
                        leaseTtlMs: this.leaseTtlMs,
                        leaseExpiresAt: redisLeaseExpiresAt
                    });
                }

                const waitMs = Math.max(this.acquireRetryMs, Number(retryAfterMs ?? 0));
                await setTimeout(waitMs + Math.floor(Math.random() * this.acquireRetryMs), undefined, { signal });
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    throw err;
                }
                logger.error(`Failed to acquire webhook dispatch capacity permit: ${stringifyError(err)}`);
                await setTimeout(this.acquireRetryMs, undefined, { signal });
            }
        }
        throw new DOMException('Dispatch capacity acquisition aborted', 'AbortError');
    }

    async recordSuccess(durationMs: number): Promise<void> {
        const response = await this.redis.eval(SUCCESS_SCRIPT, {
            keys: [this.leasesKey, this.stateKey],
            arguments: [String(Math.max(0, Math.round(durationMs))), String(this.healthyLatencyMs), String(this.hardMaximum)]
        });
        const values = response as number[];
        const limit = Number(values[0] ?? this.initialLimit);
        const previousLimit = Number(values[1] ?? limit);
        metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_CAPACITY_LIMIT, limit);
        if (limit > previousLimit) {
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CAPACITY_CHANGE, 1, { direction: 'increase' });
        }
    }

    async recordCongestion(retryAfterMs: number): Promise<void> {
        await this.recordDecrease(Math.max(0, retryAfterMs));
    }

    async recordFailure(): Promise<void> {
        await this.recordDecrease(this.controlIntervalMs);
    }

    private async recordDecrease(retryAfterMs: number): Promise<void> {
        const response = await this.redis.eval(CONGESTION_SCRIPT, {
            keys: [this.stateKey],
            arguments: ['1', String(this.hardMaximum), String(this.controlIntervalMs), String(retryAfterMs)]
        });
        const values = response as number[];
        const limit = Number(values[0] ?? 1);
        const previousLimit = Number(values[1] ?? limit);
        metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_CAPACITY_LIMIT, limit);
        if (limit < previousLimit) {
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CAPACITY_CHANGE, 1, { direction: 'decrease' });
        }
    }
}

class RedisDispatchCapacityPermit implements DispatchCapacityPermit {
    private readonly redis: NangoRedisClient;
    private readonly leasesKey: string;
    private readonly token: string;
    private readonly leaseTtlMs: number;
    private readonly leaseSafetyMarginMs: number;
    private leaseValidUntil: number;
    private readonly abortController = new AbortController();
    private readonly renewalPromise: Promise<void>;
    private valid = true;
    private released = false;

    constructor({
        redis,
        leasesKey,
        token,
        leaseTtlMs,
        leaseExpiresAt
    }: {
        redis: NangoRedisClient;
        leasesKey: string;
        token: string;
        leaseTtlMs: number;
        leaseExpiresAt: number;
    }) {
        this.redis = redis;
        this.leasesKey = leasesKey;
        this.token = token;
        this.leaseTtlMs = leaseTtlMs;
        this.leaseSafetyMarginMs = Math.max(100, Math.floor(leaseTtlMs / 3));
        this.leaseValidUntil = leaseExpiresAt - this.leaseSafetyMarginMs;
        this.renewalPromise = this.renewLoop();
    }

    isValid(): boolean {
        return this.valid && !this.released && Date.now() < this.leaseValidUntil;
    }

    async release(): Promise<void> {
        if (this.released) {
            return;
        }
        this.released = true;
        this.abortController.abort();
        await this.renewalPromise;
        try {
            const active = await this.redis.eval(RELEASE_SCRIPT, { keys: [this.leasesKey], arguments: [this.token] });
            metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_CAPACITY_ACTIVE, Number(active));
        } catch (err) {
            logger.error(`Failed to release webhook dispatch capacity permit: ${stringifyError(err)}`);
        }
    }

    private async renewLoop(): Promise<void> {
        const signal = this.abortController.signal;
        const intervalMs = Math.max(100, Math.floor(this.leaseTtlMs / 3));
        const retryIntervalMs = Math.min(1000, intervalMs);
        let waitMs = intervalMs;
        while (!signal.aborted) {
            try {
                await setTimeout(waitMs, undefined, { signal });
                const renewedUntil = await this.redis.eval(RENEW_SCRIPT, {
                    keys: [this.leasesKey],
                    arguments: [this.token, String(this.leaseTtlMs)]
                });
                if (typeof renewedUntil !== 'number' || renewedUntil <= 0) {
                    this.valid = false;
                    return;
                }
                this.leaseValidUntil = renewedUntil - this.leaseSafetyMarginMs;
                waitMs = intervalMs;
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    return;
                }
                logger.error(`Failed to renew webhook dispatch capacity permit: ${stringifyError(err)}`);
                const remainingLeaseMs = this.leaseValidUntil - Date.now();
                if (remainingLeaseMs <= 0) {
                    this.valid = false;
                    return;
                }
                waitMs = Math.min(retryIntervalMs, remainingLeaseMs);
            }
        }
    }
}
