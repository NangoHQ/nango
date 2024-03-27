import type { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';
import type { RateLimiterRes } from 'rate-limiter-flexible';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { getAccount, getRedisUrl } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils/dist/logger.js';

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
        .catch((rateLimiterRes) => {
            res.setHeader('Retry-After', Math.floor(rateLimiterRes.msBeforeNext / 1000));
            setXRateLimitHeaders(rateLimiterRes);
            logger.info(`Rate limit exceeded for ${key}. Request: ${req.method} ${req.path})`);
            res.status(429).send('Too Many Requests');
        });
};

function getKey(req: Request, res: Response): string {
    try {
        return `account-${getAccount(res)}`;
    } catch {
        if (req.user) {
            return `user-${req.user.id}`;
        }
        return `ip-${req.ip}`;
    }
}

function getPointsToConsume(req: Request): number {
    if (['/api/v1/signin', '/api/v1/signup', '/api/v1/forgot-password', '/api/v1/reset-password'].includes(req.path)) {
        // limiting  to 6 requests per period to avoid brute force attacks
        return rateLimiter.points / 6;
    }
    return 1;
}
