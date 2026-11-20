import { setTimeout } from 'node:timers/promises';

import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import db from '@nangohq/database';
import { getRedisUrl } from '@nangohq/kvstore';
import { getLogger, metrics } from '@nangohq/utils';

import { envs } from '../env.js';
import { createRateLimiterRedisClient } from '../utils/rateLimiterRedisClient.js';

import type { RequestHandler } from 'express';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';

const logger = getLogger('WebhookIngressRateLimit');

const UNKNOWN_ENVIRONMENTS_KEY = 'unknown-environments';
const KNOWN_ENVIRONMENTS_REFRESH_MS = 5 * 60 * 1000;
const KNOWN_ENVIRONMENTS_RETRY_MS = 30 * 1000;
const KNOWN_ENVIRONMENTS_FIRST_LOAD_WAIT_MS = 2000;
const MAX_CONFIRMED_TARGETS = 100_000;

export interface IngressLimiters {
    /** Keyed by environment and integration */
    integration: RateLimiterAbstract;
    /** A single budget shared by every environment id that is not known to exist */
    unknownEnvironment: RateLimiterAbstract;
    /** Keyed by a known environment, shared by its integration keys that are not known to exist */
    unknownIntegration: RateLimiterAbstract;
}

function addBounded(set: Set<string>, value: string, max: number): void {
    if (set.has(value)) {
        return;
    }
    if (set.size >= max) {
        const oldest = set.values().next();
        if (!oldest.done) {
            set.delete(oldest.value);
        }
    }
    set.add(value);
}

/**
 * Tracks which environment ids and integrations exist without a per-request database query, so an
 * unknown id can be charged to a shared budget before anything looks it up.
 *
 * Known environments come from a periodic snapshot of environments that have an integration, plus the
 * ones a handler confirmed through its own lookup since that snapshot.
 */
export class KnownIngressTargets {
    private snapshot: Set<string> | null = null;
    private snapshotAt = 0;
    private lastAttemptAt = 0;
    private loading: Promise<void> | null = null;
    private firstLoad: Promise<void> | null = null;
    private readonly confirmedEnvironments = new Set<string>();
    private readonly confirmedIntegrations = new Set<string>();

    constructor(
        private readonly opts: {
            loadEnvironmentUuids: () => Promise<string[]>;
            refreshMs: number;
            retryMs: number;
            firstLoadWaitMs: number;
            maxConfirmed: number;
        }
    ) {}

    async isKnownEnvironment(environmentUuid: string): Promise<boolean> {
        await this.refresh();
        const uuid = environmentUuid.toLowerCase();
        return this.confirmedEnvironments.has(uuid) || this.snapshot?.has(uuid) === true;
    }

    isKnownIntegration(environmentUuid: string, providerConfigKey: string): boolean {
        return this.confirmedIntegrations.has(`${environmentUuid.toLowerCase()}:${providerConfigKey}`);
    }

    /** Call only after the environment was found in the account store */
    confirmEnvironment(environmentUuid: string): void {
        addBounded(this.confirmedEnvironments, environmentUuid.toLowerCase(), this.opts.maxConfirmed);
    }

    /** Call only after the integration was found in that environment */
    confirmIntegration(environmentUuid: string, providerConfigKey: string): void {
        addBounded(this.confirmedIntegrations, `${environmentUuid.toLowerCase()}:${providerConfigKey}`, this.opts.maxConfirmed);
    }

    private async refresh(): Promise<void> {
        const now = Date.now();
        if (!this.loading && now - this.snapshotAt >= this.opts.refreshMs && now - this.lastAttemptAt >= this.opts.retryMs) {
            this.lastAttemptAt = now;
            this.loading = this.opts
                .loadEnvironmentUuids()
                .then((uuids) => {
                    this.snapshot = new Set(uuids.map((uuid) => uuid.toLowerCase()));
                    this.snapshotAt = Date.now();
                    this.confirmedEnvironments.clear();
                })
                .catch((err: unknown) => {
                    logger.error('Failed to load known environments for webhook ingress rate limit', { error: err });
                })
                .finally(() => {
                    this.loading = null;
                });
            if (!this.firstLoad) {
                // Bounded so a slow first load does not hold requests; until it lands, ids are treated as unknown
                this.firstLoad = Promise.race([this.loading, setTimeout(this.opts.firstLoadWaitMs, undefined, { ref: false })]);
            }
        }
        if (this.firstLoad) {
            await this.firstLoad;
        }
    }
}

export async function loadEnvironmentUuidsWithIntegrations(): Promise<string[]> {
    const rows = await db.readOnly
        .select<{ uuid: string }[]>('_nango_environments.uuid')
        .from('_nango_environments')
        .where('_nango_environments.deleted', false)
        .whereExists(function () {
            void this.select(db.knex.raw('1'))
                .from('_nango_configs')
                .whereRaw('_nango_configs.environment_id = _nango_environments.id')
                .where('_nango_configs.deleted', false);
        });
    return rows.map((row) => row.uuid);
}

export const knownIngressTargets = new KnownIngressTargets({
    loadEnvironmentUuids: loadEnvironmentUuidsWithIntegrations,
    refreshMs: KNOWN_ENVIRONMENTS_REFRESH_MS,
    retryMs: KNOWN_ENVIRONMENTS_RETRY_MS,
    firstLoadWaitMs: KNOWN_ENVIRONMENTS_FIRST_LOAD_WAIT_MS,
    maxConfirmed: MAX_CONFIRMED_TARGETS
});

interface Deps {
    limit: number;
    unknownEnvironmentLimit: number;
    enforce: boolean;
    metric: metrics.Types;
    getLimiters: () => Promise<IngressLimiters>;
    /** In-process limiters used when the shared limiters are unavailable, so a store outage never skips the limit */
    fallbackLimiters: IngressLimiters;
    knownTargets: Pick<KnownIngressTargets, 'isKnownEnvironment' | 'isKnownIntegration'>;
}

async function consume(primary: RateLimiterAbstract, fallback: RateLimiterAbstract, key: string): Promise<{ allowed: boolean; result: RateLimiterRes }> {
    if (primary !== fallback) {
        try {
            return { allowed: true, result: await primary.consume(key, 1) };
        } catch (err) {
            if (err instanceof RateLimiterRes) {
                return { allowed: false, result: err };
            }
            logger.error('Failed to consume webhook ingress rate limit, using in-process limiter', { error: err });
        }
    }

    try {
        return { allowed: true, result: await fallback.consume(key, 1) };
    } catch (err) {
        if (err instanceof RateLimiterRes) {
            return { allowed: false, result: err };
        }
        throw err;
    }
}

/**
 * Rate limits public routes addressed by `:environmentUuid/:providerConfigKey`, before the handler looks either up.
 *
 * Every request is charged to its environment and integration. An environment id that is not known to exist is
 * also charged to one budget shared by all such ids, and an integration key not known to exist in a known
 * environment is also charged to a budget shared by that environment's unknown keys. Fresh ids or keys therefore
 * never bring a fresh allowance.
 */
export function createEnvironmentIngressRateLimit(deps: Deps): RequestHandler {
    const points: Record<keyof IngressLimiters, number> = {
        integration: deps.limit,
        unknownEnvironment: deps.unknownEnvironmentLimit,
        unknownIntegration: deps.limit
    };

    return async (req, res, next) => {
        if (deps.limit <= 0) {
            next();
            return;
        }

        const environmentUuid = String(req.params['environmentUuid'] ?? '').toLowerCase();
        const providerConfigKey = String(req.params['providerConfigKey'] ?? '');

        try {
            let limiters: IngressLimiters;
            try {
                limiters = await deps.getLimiters();
            } catch (err) {
                logger.error('Failed to build webhook ingress rate limiters, using in-process limiters', { error: err });
                limiters = deps.fallbackLimiters;
            }

            const checks: [keyof IngressLimiters, string][] = [];
            if (!(await deps.knownTargets.isKnownEnvironment(environmentUuid))) {
                checks.push(['unknownEnvironment', UNKNOWN_ENVIRONMENTS_KEY]);
            } else if (!deps.knownTargets.isKnownIntegration(environmentUuid, providerConfigKey)) {
                checks.push(['unknownIntegration', environmentUuid]);
            }
            checks.push(['integration', `${environmentUuid}:${providerConfigKey}`]);

            for (const [budget, key] of checks) {
                const { allowed, result } = await consume(limiters[budget], deps.fallbackLimiters[budget], key);

                if (allowed && budget !== 'integration') {
                    continue;
                }

                res.setHeader('X-RateLimit-Limit', points[budget]);
                res.setHeader('X-RateLimit-Remaining', result.remainingPoints);
                res.setHeader('X-RateLimit-Reset', Math.floor((Date.now() + result.msBeforeNext) / 1000));

                if (allowed) {
                    continue;
                }

                const retryAfterSeconds = Math.max(1, Math.ceil(result.msBeforeNext / 1000));
                metrics.increment(deps.metric, 1, { enforced: deps.enforce ? 'true' : 'false', budget });
                // Once per key and window, so a flood does not turn into a log flood
                if (result.consumedPoints === points[budget] + 1) {
                    logger.warning('Webhook ingress rate limit breached', {
                        budget,
                        environmentUuid: budget === 'unknownEnvironment' ? undefined : environmentUuid,
                        providerConfigKey: budget === 'integration' ? providerConfigKey : undefined,
                        retryAfterSeconds,
                        enforced: deps.enforce
                    });
                }

                if (deps.enforce) {
                    res.setHeader('Retry-After', retryAfterSeconds);
                    res.status(429).send({ error: { code: 'too_many_request' } });
                    return;
                }
            }

            next();
        } catch (err) {
            next(err);
        }
    };
}

function createMemoryLimiters(keyPrefix: string): IngressLimiters {
    return {
        integration: new RateLimiterMemory({ keyPrefix, points: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN, duration: 60 }),
        unknownEnvironment: new RateLimiterMemory({
            keyPrefix: `${keyPrefix}-unknown-env`,
            points: envs.NANGO_WEBHOOK_INGRESS_UNKNOWN_ENVIRONMENT_RATE_LIMIT_PER_MIN,
            duration: 60
        }),
        unknownIntegration: new RateLimiterMemory({
            keyPrefix: `${keyPrefix}-unknown-integration`,
            points: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN,
            duration: 60
        })
    };
}

let redisClientPromise: ReturnType<typeof createRateLimiterRedisClient> | null = null;

function getRedisClient(url: string): ReturnType<typeof createRateLimiterRedisClient> {
    if (!redisClientPromise) {
        redisClientPromise = createRateLimiterRedisClient(url)
            .then((client) => {
                client.on('error', (err) => {
                    logger.error(`Redis (webhook-ingress rate-limiter) error: ${err}`);
                });
                return client;
            })
            .catch((err: unknown) => {
                // Don't cache the rejection — let the next request retry the connection
                redisClientPromise = null;
                throw err;
            });
    }
    return redisClientPromise;
}

function createDefaultLimiters(keyPrefix: string): { getLimiters: () => Promise<IngressLimiters>; fallbackLimiters: IngressLimiters } {
    const fallbackLimiters = createMemoryLimiters(keyPrefix);
    let limiters: IngressLimiters | null = null;

    const getLimiters = async (): Promise<IngressLimiters> => {
        if (limiters) {
            return limiters;
        }

        const url = getRedisUrl();
        if (!url) {
            limiters = fallbackLimiters;
            return limiters;
        }

        const storeClient = await getRedisClient(url);
        const redisLimiter = (name: keyof IngressLimiters): RateLimiterAbstract => {
            const fallback = fallbackLimiters[name] as RateLimiterMemory;
            return new RateLimiterRedis({
                storeClient,
                useRedisPackage: true,
                keyPrefix: fallback.keyPrefix,
                points: fallback.points,
                duration: fallback.duration,
                insuranceLimiter: fallback
            });
        };
        limiters = {
            integration: redisLimiter('integration'),
            unknownEnvironment: redisLimiter('unknownEnvironment'),
            unknownIntegration: redisLimiter('unknownIntegration')
        };
        return limiters;
    };

    return { getLimiters, fallbackLimiters };
}

export const webhookIngressRateLimit: RequestHandler = createEnvironmentIngressRateLimit({
    limit: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN,
    unknownEnvironmentLimit: envs.NANGO_WEBHOOK_INGRESS_UNKNOWN_ENVIRONMENT_RATE_LIMIT_PER_MIN,
    enforce: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_ENFORCE,
    metric: metrics.Types.WEBHOOK_INCOMING_RATE_LIMITED,
    knownTargets: knownIngressTargets,
    ...createDefaultLimiters('webhook-ingress')
});

export const clientMetadataRateLimit: RequestHandler = createEnvironmentIngressRateLimit({
    limit: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN,
    unknownEnvironmentLimit: envs.NANGO_WEBHOOK_INGRESS_UNKNOWN_ENVIRONMENT_RATE_LIMIT_PER_MIN,
    enforce: envs.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_ENFORCE,
    metric: metrics.Types.CLIENT_METADATA_RATE_LIMITED,
    knownTargets: knownIngressTargets,
    ...createDefaultLimiters('client-metadata')
});
