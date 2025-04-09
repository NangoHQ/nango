import path from 'node:path';

import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { createClient } from 'redis';

import { getRedisUrl } from '@nangohq/shared';
import { flagHasAPIRateLimit, flagHasPlan, getLogger } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express';
import type { DBPlan } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';

const logger = getLogger('RateLimiter');

const defaultLimit = parseInt(process.env['DEFAULT_RATE_LIMIT_PER_MIN'] || '0') || 3500;
const rateLimiterSize: Record<DBPlan['api_rate_limit_size'], number> = {
    s: defaultLimit / 2,
    m: defaultLimit,
    l: defaultLimit * 5,
    xl: defaultLimit * 10,
    '2xl': defaultLimit * 50,
    '3xl': defaultLimit * 100
};
const limiters = new Map<DBPlan['api_rate_limit_size'], RateLimiterAbstract>();

/**
 * Dynamically get a rate limiter based on the plan size
 */
async function getRateLimiter(size: DBPlan['api_rate_limit_size']) {
    if (limiters.has(size)) {
        return limiters.get(size)!;
    }

    const opts = {
        keyPrefix: 'middleware',
        points: rateLimiterSize[size],
        duration: 60,
        blockDuration: 0
    };

    const url = getRedisUrl();
    let limiter: RateLimiterAbstract;
    if (url) {
        const redisClient = await createClient({ url: url, disableOfflineQueue: true }).connect();
        redisClient.on('error', (err) => {
            logger.error(`Redis (rate-limiter) error: ${err}`);
        });
        limiter = new RateLimiterRedis({ storeClient: redisClient, ...opts });
    } else {
        limiter = new RateLimiterMemory(opts);
    }

    limiters.set(size, limiter);
    return limiter;
}

/**
 * Rate limit api calls
 */
export const rateLimiterMiddleware = async (req: Request, res: Response<any, RequestLocals>, next: NextFunction) => {
    if (!flagHasAPIRateLimit) {
        next();
        return;
    }

    function setXRateLimitHeaders(maxPoints: number, rateLimiterRes: RateLimiterRes) {
        const resetEpoch = Math.floor(new Date(Date.now() + rateLimiterRes.msBeforeNext).getTime() / 1000);

        res.setHeader('X-RateLimit-Limit', maxPoints);
        res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints);
        res.setHeader('X-RateLimit-Reset', resetEpoch);
    }

    const size = res.locals.plan?.api_rate_limit_size || 'm';
    const maxPoints = rateLimiterSize[size];
    const key = getKey(req, res);
    const pointsToConsume = getPointsToConsume(req, res, maxPoints);

    try {
        const rateLimiter = await getRateLimiter(size);
        const resConsume = await rateLimiter.consume(key, pointsToConsume);

        setXRateLimitHeaders(rateLimiter.points, resConsume);
        next();
    } catch (err) {
        if (err instanceof RateLimiterRes) {
            logger.info(`Rate limit exceeded for ${key}. Request: ${req.method} ${req.path})`);

            setXRateLimitHeaders(maxPoints, err);
            res.setHeader('Retry-After', Math.floor(err.msBeforeNext / 1000));
            res.status(429).send({ error: { code: 'too_many_request' } });
            return;
        }

        logger.error('Failed to compute rate limit', { error: err });
        // If we can't get the rate limit (ex: redis is unreachable), we should not block the request
        next();
    }
};

function getKey(req: Request, res: Response<any, RequestLocals>): string {
    if ('account' in res.locals) {
        // We have one for the secret key usage (customers or syncs) and one for the rest (dashboard, public key, session token)
        // To avoid syncs bringing down dashboard and reverse
        return `account-${res.locals.authType === 'secretKey' ? 'secret' : 'global'}-${res.locals['account'].id}`;
    } else if (req.user) {
        return `user-${req.user.id}`;
    }
    return `ip-${req.ip}`;
}

const specialPaths = ['/api/v1/account'];
function getPointsToConsume(req: Request, res: Response<any, RequestLocals>, maxPoints: number): number {
    const fullPath = path.join(req.baseUrl, req.route.path);

    if (specialPaths.some((p) => fullPath.startsWith(p))) {
        // limiting to 6 requests per period to avoid brute force attacks
        return Math.floor(maxPoints / 6);
    } else if (!res.locals.account || (flagHasPlan && !res.locals.plan)) {
        // Throttle api calls without valid credentials
        return 10;
    }

    return 1;
}
