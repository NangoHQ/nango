import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { Err } from '@nangohq/utils';

import type { getRedis } from '@nangohq/kvstore';
import type { Result } from '@nangohq/types';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitStateData {
    state: CircuitState;
    untilMs: number;
}

interface CircuitBreakerOptions {
    failureThreshold: number;
    windowSecs: number;
    cooldownDurationSecs: number;
    autoResetSecs: number;
}

export interface CircuitBreaker {
    execute<T>(key: string, fn: () => Promise<Result<T>>): Promise<Result<T>>;
}

export class CircuitBreakerPassThrough implements CircuitBreaker {
    async execute<T>(_key: string, fn: () => Promise<Result<T>>): Promise<Result<T>> {
        return fn();
    }
}

export class CircuitBreakerRedis implements CircuitBreaker {
    private readonly id: string;
    private readonly redis: Awaited<ReturnType<typeof getRedis>>;
    private readonly failureLimiter: RateLimiterRedis;
    private readonly cooldownDurationMs: number;
    private readonly autoResetSecs: number;
    private readonly keyPrefix: string;

    constructor({ id, redis, options }: { id: string; redis: Awaited<ReturnType<typeof getRedis>>; options: CircuitBreakerOptions }) {
        this.id = id;
        this.cooldownDurationMs = options.cooldownDurationSecs * 1000;
        this.redis = redis;
        this.autoResetSecs = options.autoResetSecs;
        this.keyPrefix = `circuitbreaker:${id}`;

        // Rate limiter for tracking failures
        this.failureLimiter = new RateLimiterRedis({
            storeClient: redis,
            keyPrefix: `${this.keyPrefix}:failures`,
            points: options.failureThreshold,
            duration: options.windowSecs
        });
    }

    async execute<T>(key: string, fn: () => Promise<Result<T>>): Promise<Result<T>> {
        const stateData = await this.getState(key);
        const now = Date.now();

        // No state = CLOSED (normal operation)
        if (!stateData) {
            return this.executeClosed(key, fn);
        }

        if (stateData.state === 'OPEN') {
            if (now < stateData.untilMs) {
                // OPEN and now < untilMs => error
                return Err(`circuit_breaker_open_${this.id}_${key}`);
            } else {
                // OPEN and now >= untilMs => Recovery attempt
                return this.executeWithRecovery(key, fn);
            }
        }

        if (stateData.state === 'HALF_OPEN') {
            if (now < stateData.untilMs) {
                // HALF_OPEN and now < untilMs => error
                return Err(`circuit_breaker_halfopen_${this.id}_${key}`);
            } else {
                // HALF_OPEN after untilMs => recovery attempt
                return await this.executeWithRecovery(key, fn);
            }
        }

        // CLOSED state (shouldn't reach here if no key, but handle it)
        return this.executeClosed(key, fn);
    }

    // Execute function in CLOSED state
    // If it fails, record the failure
    // If failures exceed threshold, open the circuit
    private async executeClosed<T>(key: string, fn: () => Promise<Result<T>>): Promise<Result<T>> {
        const res = await fn();
        if (res.isErr()) {
            try {
                await this.failureLimiter.consume(key, 1);
            } catch (err) {
                // too many failures => open circuit
                if (err instanceof RateLimiterRes) {
                    const now = Date.now();
                    await this.setState(key, {
                        state: 'OPEN',
                        untilMs: now + this.cooldownDurationMs
                    });
                }
            }
        }
        return res;
    }

    // Execute function and attempt recovery
    // If it fails, re-open the circuit
    // If it succeeds, close the circuit
    private async executeWithRecovery<T>(key: string, fn: () => Promise<Result<T>>): Promise<Result<T>> {
        const now = Date.now();
        // Move to HALF_OPEN state before executing the function
        await this.setState(key, {
            state: 'HALF_OPEN',
            untilMs: now + this.cooldownDurationMs
        });
        // At least one execution is allowed in HALF_OPEN to check if the underlying issue is resolved
        // We accept that multiple concurrent calls may enter HALF_OPEN state for simplicity
        const res = await fn();
        if (res.isErr()) {
            // Failure in half-open = re-open the circuit
            await this.setState(key, {
                state: 'OPEN',
                untilMs: now + this.cooldownDurationMs
            });
        } else {
            // Success in half-open = remove the key (back to closed/normal)
            await this.removeState(key);
            await this.failureLimiter.delete(key);
        }
        return res;
    }

    private async getState(key: string): Promise<CircuitStateData | null> {
        const data = await this.redis.get(`${this.keyPrefix}:${key}`);
        if (!data) {
            return null;
        }
        return JSON.parse(data);
    }

    private async setState(key: string, state: CircuitStateData): Promise<void> {
        const ttlMs = this.autoResetSecs * 1000;
        await this.redis.set(`${this.keyPrefix}:${key}`, JSON.stringify(state), { PX: ttlMs });
    }

    private async removeState(key: string): Promise<void> {
        await this.redis.del(`${this.keyPrefix}:${key}`);
    }
}
