import express from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { createClient } from 'redis';

import db from '@nangohq/database';
import { getRedisClientOptions, getRedisUrl } from '@nangohq/kvstore';
import { accountService, deliverXSignup, isInternalAccount, parseXSignupEnvelope, userService } from '@nangohq/shared';

import { envs } from '../../env.js';
import { safeCompare } from '../../webhook/signature.js';

import type { XSignupCredentials, XSignupDelivery, XSignupEnvelope } from '@nangohq/shared';
import type { ErrorRequestHandler } from 'express';

export interface XSignupAdapterConfig extends XSignupCredentials {
    enabled: boolean;
    routeSecret: string;
    startAt: string;
}
interface Deps {
    config: () => XSignupAdapterConfig;
    limit: (key: string) => Promise<unknown>;
    lookup: (companyId: number) => Promise<{ createdAt: number; isFirstActiveUserInternal: boolean; isInternal: boolean } | undefined>;
    deliver: (event: XSignupEnvelope, config: XSignupCredentials) => Promise<XSignupDelivery>;
    now?: () => number;
}

/** Mounted before the internal router's general parsers/auth. Dedicated secret has only this route's authority. */
export function createXSignupRouter(deps: Deps) {
    const router = express.Router();
    router.use(async (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        const config = deps.config();
        if (!config.enabled) {
            res.status(404).json({ outcome: 'disabled' });
            return;
        }
        try {
            await deps.limit(req.ip ?? 'unknown');
        } catch (err) {
            res.status(err instanceof RateLimiterRes ? 429 : 503).json({ outcome: 'retry', reason: 'rate_limit' });
            return;
        }
        const auth = req.get('authorization');
        if (!auth?.startsWith('Bearer ') || !safeCompare(config.routeSecret, auth.slice(7))) {
            res.status(401).json({ outcome: 'rejected', reason: 'authorization' });
            return;
        }
        if (Object.keys(req.query).length || req.method !== 'POST') {
            res.status(400).json({ outcome: 'rejected', reason: 'request' });
            return;
        }
        next();
    });
    router.use(express.json({ limit: '8kb', strict: true, inflate: false }));
    router.post('/', async (req, res) => {
        const config = deps.config();
        const event = parseXSignupEnvelope(req.body, config.startAt, deps.now?.());
        if (!event) {
            res.status(400).json({ outcome: 'rejected', reason: 'event' });
            return;
        }
        try {
            const account = await deps.lookup(Number(event.companyId));
            // Signup precedes the first user's commit; retry a short-lived missing lookup without blocking signup.
            if (!account) {
                res.status(503).json({ outcome: 'retry', reason: 'account_unavailable' });
                return;
            }
            const sinceCreation = Date.parse(event.timestamp) - account.createdAt;
            if (
                !Number.isFinite(account.createdAt) ||
                account.isFirstActiveUserInternal ||
                account.isInternal ||
                sinceCreation < 0 ||
                sinceCreation > 300_000
            ) {
                res.status(400).json({ outcome: 'rejected', reason: 'account' });
                return;
            }
            const result = await deps.deliver(event, config);
            res.status(result.outcome === 'retry' ? 503 : 200).json(result);
        } catch {
            res.status(503).json({ outcome: 'retry', reason: 'unavailable' });
        }
    });
    const parseError: ErrorRequestHandler = (_err, _req, res, _next) => {
        // Do not forward parser errors: default middleware includes invalid JSON excerpts in responses.
        res.status(400).json({ outcome: 'rejected', reason: 'body' });
    };
    router.use(parseError);
    return router;
}

let limiter: Promise<RateLimiterRedis> | undefined;
export const xSignupRouter = createXSignupRouter({
    config: () => ({
        enabled: envs.SIGNUP_X_DELIVERY_ENABLED,
        routeSecret: envs.SIGNUP_X_ROUTE_SECRET ?? '',
        startAt: envs.SIGNUP_X_DELIVERY_START_AT ?? '',
        pixelId: envs.SIGNUP_X_PIXEL_ID ?? '',
        eventId: envs.SIGNUP_X_EVENT_ID ?? '',
        consumerKey: envs.SIGNUP_X_CONSUMER_KEY ?? '',
        consumerSecret: envs.SIGNUP_X_CONSUMER_SECRET ?? '',
        accessToken: envs.SIGNUP_X_ACCESS_TOKEN ?? '',
        accessTokenSecret: envs.SIGNUP_X_ACCESS_TOKEN_SECRET ?? ''
    }),
    limit: async (key) => {
        limiter ??= (async () => {
            const url = getRedisUrl();
            if (!url) throw new Error('limiter unavailable');
            const options = getRedisClientOptions(url);
            const client = createClient({
                ...options,
                commandsQueueMaxLength: 128,
                socket: { ...options.socket, connectTimeout: 1000, reconnectStrategy: false }
            });
            client.on('error', () => {
                limiter = undefined;
            }); // Redis failure stays inside this disabled-by-default route.
            await client.connect();
            return new RateLimiterRedis({ storeClient: client, useRedisPackage: true, keyPrefix: 'signup-x-adapter', points: 120, duration: 60 });
        })().catch(() => {
            limiter = undefined;
            throw new Error('limiter unavailable');
        });
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                limiter.then((value) => value.consume(key)),
                new Promise<never>((_resolve, reject) => {
                    timeout = setTimeout(() => reject(new Error('limiter unavailable')), 1500);
                })
            ]);
        } finally {
            clearTimeout(timeout);
        }
    },
    lookup: async (companyId) => {
        const account = await accountService.getAccountById(db.knex, companyId);
        const users = await userService.getUsersByAccountId(companyId);
        const first = users.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())[0];
        if (!account || !first) return;
        return { createdAt: account.created_at.getTime(), isFirstActiveUserInternal: isInternalAccount([first]), isInternal: isInternalAccount(users) };
    },
    deliver: deliverXSignup
});
