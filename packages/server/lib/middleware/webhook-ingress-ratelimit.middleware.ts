import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { createClient } from 'redis';

import { getRedisUrl } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';

import { envs } from '../env.js';

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

        try {
            const limiter = await deps.getLimiter();
            const key = `${envUuid}:${providerConfigKey}`;

            try {
                await limiter.consume(key, 1);
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

    const isExternal = url.startsWith('rediss://');
    const socket = isExternal
        ? {
              reconnectStrategy: (retries: number) => Math.min(retries * 200, 2000),
              connectTimeout: 10_000,
              tls: true,
              servername: new URL(url).hostname,
              keepAlive: 60_000
          }
        : {};

    const redisClient = await createClient({
        url,
        disableOfflineQueue: true,
        pingInterval: 30_000,
        socket
    }).connect();
    redisClient.on('error', (err) => {
        logger.error(`Redis (webhook-ingress rate-limiter) error: ${err}`);
    });

    return new RateLimiterRedis({ storeClient: redisClient, ...opts });
}

function getDefaultLimiter(): Promise<RateLimiterAbstract> {
    if (!limiterPromise) {
        limiterPromise = buildLimiter();
    }
    return limiterPromise;
}

export const webhookIngressRateLimit: RequestHandler = createWebhookIngressRateLimit({
    limit: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN,
    enforce: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_ENFORCE,
    getLimiter: getDefaultLimiter
});
