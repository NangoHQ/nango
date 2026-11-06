import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { getRedisUrl } from '@nangohq/kvstore';
import { getLogger } from '@nangohq/utils';

import { createRateLimiterRedisClient } from '../utils/rateLimiterRedisClient.js';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';

const logger = getLogger('AgentPlaygroundRateLimit');

export const PLAYGROUND_TURNS_PER_MIN_PER_USER = 20;
export const PLAYGROUND_TURNS_PER_MIN_PER_ACCOUNT = 60;

interface Limiters {
    user: RateLimiterAbstract;
    account: RateLimiterAbstract;
}

export function createAgentPlaygroundRateLimit(getLimiters: () => Promise<Limiters>) {
    return async (_req: Request, res: Response<unknown, Partial<RequestLocals>>, next: NextFunction) => {
        const { account, user } = res.locals;
        if (!account || !user) {
            next();
            return;
        }

        let limiters: Limiters;
        try {
            limiters = await getLimiters();
        } catch (err) {
            logger.error('Failed to build the Agent Playground rate limiters', { error: err });
            next();
            return;
        }

        for (const [scope, limiter, key] of [
            ['user', limiters.user, `user-${user.id}`],
            ['account', limiters.account, `account-${account.id}`]
        ] as const) {
            try {
                await limiter.consume(key, 1);
            } catch (err) {
                if (err instanceof RateLimiterRes) {
                    logger.warning('Agent Playground rate limit exceeded', { scope, accountId: account.id, userId: user.id });
                    res.setHeader('Retry-After', Math.max(1, Math.ceil(err.msBeforeNext / 1000)));
                    res.status(429).send({ error: { code: 'too_many_request', message: `Too many Agent Playground messages for this ${scope}` } });
                    return;
                }
                logger.error('Failed to compute the Agent Playground rate limit', { error: err });
            }
        }

        next();
    };
}

let limitersPromise: Promise<Limiters> | null = null;

async function buildLimiters(): Promise<Limiters> {
    const opts = (scope: string, points: number) => ({ keyPrefix: `agent-playground-${scope}`, points, duration: 60, blockDuration: 0 });

    const url = getRedisUrl();
    if (!url) {
        return {
            user: new RateLimiterMemory(opts('user', PLAYGROUND_TURNS_PER_MIN_PER_USER)),
            account: new RateLimiterMemory(opts('account', PLAYGROUND_TURNS_PER_MIN_PER_ACCOUNT))
        };
    }

    const redisClient = await createRateLimiterRedisClient(url);
    redisClient.on('error', (err) => {
        logger.error(`Redis (agent playground rate-limiter) error: ${err}`);
    });
    return {
        user: new RateLimiterRedis({ storeClient: redisClient, useRedisPackage: true, ...opts('user', PLAYGROUND_TURNS_PER_MIN_PER_USER) }),
        account: new RateLimiterRedis({ storeClient: redisClient, useRedisPackage: true, ...opts('account', PLAYGROUND_TURNS_PER_MIN_PER_ACCOUNT) })
    };
}

export const agentPlaygroundRateLimit = createAgentPlaygroundRateLimit(() => {
    if (!limitersPromise) {
        limitersPromise = buildLimiters().catch((err: unknown) => {
            limitersPromise = null;
            throw err;
        });
    }
    return limitersPromise;
});
