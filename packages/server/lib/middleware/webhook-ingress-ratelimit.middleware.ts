import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { getRedisUrl } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';

import { envs } from '../env.js';
import { createRateLimiterRedisClient } from '../utils/rateLimiterRedisClient.js';

import type { RequestHandler } from 'express';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';

const logger = getLogger('WebhookIngressRateLimit');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Deps {
    limit: number;
    enforce: boolean;
    getLimiter: () => Promise<RateLimiterAbstract>;
}

export function createWebhookIngressRateLimit(deps: Deps): RequestHandler {
    return async (req, res, next) => {
        if (deps.limit <= 0) {
            next();
            return;
        }

        const environmentUuid = req.params['environmentUuid'];
        const providerConfigKey = req.params['providerConfigKey'];

        if (!environmentUuid || !providerConfigKey || !UUID_V4.test(environmentUuid)) {
            next();
            return;
        }

        const envUuid = environmentUuid.toLowerCase();

        function setXRateLimitHeaders(rateLimiterRes: RateLimiterRes) {
            const resetEpoch = Math.floor(new Date(Date.now() + rateLimiterRes.msBeforeNext).getTime() / 1000);
            res.setHeader('X-RateLimit-Limit', deps.limit);
            res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints);
            res.setHeader('X-RateLimit-Reset', resetEpoch);
        }

        try {
            const limiter = await deps.getLimiter();
            const key = `${envUuid}:${providerConfigKey}`;

            try {
                const resConsume = await limiter.consume(key, 1);
                setXRateLimitHeaders(resConsume);
                next();
                return;
            } catch (err) {
                if (err instanceof RateLimiterRes) {
                    const retryAfterSeconds = Math.max(1, Math.ceil(err.msBeforeNext / 1000));

                    logger.warning('Webhook ingress rate limit breached', {
                        environmentUuid: envUuid,
                        providerConfigKey,
                        retryAfterSeconds,
                        enforced: deps.enforce
                    });
                    metrics.increment(metrics.Types.WEBHOOK_INCOMING_RATE_LIMITED, 1, {
                        enforced: deps.enforce ? 'true' : 'false'
                    });

                    setXRateLimitHeaders(err);

                    if (deps.enforce) {
                        res.setHeader('Retry-After', retryAfterSeconds);
                        res.status(429).send({ error: { code: 'too_many_request' } });
                        return;
                    }

                    next();
                    return;
                }

                logger.error('Failed to consume webhook ingress rate limit', { error: err });
                next();
                return;
            }
        } catch (err) {
            logger.error('Unexpected error in webhook ingress rate limit middleware', { error: err });
            next();
        }
    };
}

let limiterPromise: Promise<RateLimiterAbstract> | null = null;

async function buildLimiter(): Promise<RateLimiterAbstract> {
    const opts = {
        keyPrefix: 'webhook-ingress',
        points: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN,
        duration: 60,
        blockDuration: 0
    };

    const url = getRedisUrl();
    if (!url) {
        return new RateLimiterMemory(opts);
    }

    const redisClient = await createRateLimiterRedisClient(url);
    redisClient.on('error', (err) => {
        logger.error(`Redis (webhook-ingress rate-limiter) error: ${err}`);
    });

    return new RateLimiterRedis({ storeClient: redisClient, ...opts });
}

function getDefaultLimiter(): Promise<RateLimiterAbstract> {
    if (!limiterPromise) {
        limiterPromise = buildLimiter().catch((err: unknown) => {
            // Don't cache the rejection — let the next request retry the build
            limiterPromise = null;
            throw err;
        });
    }
    return limiterPromise;
}

export const webhookIngressRateLimit: RequestHandler = createWebhookIngressRateLimit({
    limit: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN,
    enforce: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_ENFORCE,
    getLimiter: getDefaultLimiter
});
