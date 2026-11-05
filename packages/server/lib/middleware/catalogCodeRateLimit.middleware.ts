import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { getRedisUrl } from '@nangohq/kvstore';
import { getLogger, metrics } from '@nangohq/utils';

import { envs } from '../env.js';
import { createRateLimiterRedisClient } from '../utils/rateLimiterRedisClient.js';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';

const logger = getLogger('CatalogCodeRateLimit');

const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

interface Deps {
    limit: number;
    getLimiter: () => Promise<RateLimiterAbstract>;
}

/**
 * Daily cap on catalog function code per account.
 * Bursts are already covered by the regular API rate limit.
 */
export function createCatalogCodeRateLimit(deps: Deps) {
    return async (_req: Request, res: Response<unknown, Partial<RequestLocals>>, next: NextFunction) => {
        const { account } = res.locals;
        if (deps.limit <= 0 || !account) {
            next();
            return;
        }

        try {
            const limiter = await deps.getLimiter();
            await limiter.consume(`account-${account.id}`, 1);
            next();
        } catch (err) {
            if (err instanceof RateLimiterRes) {
                logger.warning('Catalog code rate limit exceeded', { accountId: account.id });
                metrics.increment(metrics.Types.CATALOG_CODE_RATE_LIMITED, 1, { accountId: account.id });
                res.setHeader('Retry-After', Math.max(1, Math.ceil(err.msBeforeNext / 1000)));
                res.status(429).send({ error: { code: 'too_many_request', message: 'Daily limit of catalog functions reached' } });
                return;
            }

            logger.error('Failed to compute the catalog code rate limit', { error: err });
            next();
        }
    };
}

let limiterPromise: Promise<RateLimiterAbstract> | null = null;

async function buildLimiter(): Promise<RateLimiterAbstract> {
    const opts = { keyPrefix: 'catalog-code', points: envs.NANGO_CATALOG_CODE_RATE_LIMIT_PER_DAY, duration: ONE_DAY_IN_SECONDS, blockDuration: 0 };

    const url = getRedisUrl();
    if (!url) {
        return new RateLimiterMemory(opts);
    }

    const redisClient = await createRateLimiterRedisClient(url);
    redisClient.on('error', (err) => {
        logger.error(`Redis (catalog code rate-limiter) error: ${err}`);
    });
    return new RateLimiterRedis({ storeClient: redisClient, useRedisPackage: true, ...opts });
}

export const catalogCodeRateLimit = createCatalogCodeRateLimit({
    limit: envs.NANGO_CATALOG_CODE_RATE_LIMIT_PER_DAY,
    getLimiter: () => {
        if (!limiterPromise) {
            limiterPromise = buildLimiter().catch((err: unknown) => {
                limiterPromise = null;
                throw err;
            });
        }
        return limiterPromise;
    }
});
