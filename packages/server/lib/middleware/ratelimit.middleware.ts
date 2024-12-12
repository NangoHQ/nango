import type { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';
import { RateLimiterRes, RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { getRedisUrl } from '@nangohq/shared';
import { flagHasAPIRateLimit, getLogger } from '@nangohq/utils';

const logger = getLogger('RateLimiter');

const rateLimiter = await (async () => {
    const opts = {
        keyPrefix: 'middleware',
        points: parseInt(process.env['DEFAULT_RATE_LIMIT_PER_MIN'] || '0') || 2400,
        duration: 60,
        blockDuration: 0
    };
    const url = getRedisUrl();
    if (url) {
        const redisClient = await createClient({ url: url, disableOfflineQueue: true }).connect();
        redisClient.on('error', (err) => {
            logger.error(`Redis (rate-limiter) error: ${err}`);
        });
        return new RateLimiterRedis({
            storeClient: redisClient,
            ...opts
        });
    }
    return new RateLimiterMemory(opts);
})();

export const rateLimiterMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!flagHasAPIRateLimit) {
        next();
        return;
    }

    const setXRateLimitHeaders = (rateLimiterRes: RateLimiterRes) => {
        const resetEpoch = Math.floor(new Date(Date.now() + rateLimiterRes.msBeforeNext).getTime() / 1000);
        res.setHeader('X-RateLimit-Limit', rateLimiter.points);
        res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints);
        res.setHeader('X-RateLimit-Reset', resetEpoch);
    };
    const key = getKey(req, res);
    const pointsToConsume = getPointsToConsume(req);
    rateLimiter
        .consume(key, pointsToConsume)
        .then((rateLimiterRes) => {
            setXRateLimitHeaders(rateLimiterRes);
            next();
        })
        .catch((err: unknown) => {
            if (err instanceof RateLimiterRes) {
                res.setHeader('Retry-After', Math.floor(err.msBeforeNext / 1000));
                setXRateLimitHeaders(err);
                logger.info(`Rate limit exceeded for ${key}. Request: ${req.method} ${req.path})`);
                res.status(429).send({ error: { code: 'too_many_request' } });
                return;
            }

            logger.error('Failed to compute rate limit', { error: err });
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to compute rate limit' } });
        });
};

function getKey(req: Request, res: Response): string {
    if ('account' in res.locals) {
        return `account-${res.locals['account'].id}`;
    } else if (req.user) {
        return `user-${req.user.id}`;
    }
    return `ip-${req.ip}`;
}

function getPointsToConsume(req: Request): number {
    const paths = ['/api/v1/account'];

    if (paths.some((path) => req.path.startsWith(path))) {
        // limiting to 6 requests per period to avoid brute force attacks
        return Math.floor(rateLimiter.points / 6);
    }
    return 1;
}
