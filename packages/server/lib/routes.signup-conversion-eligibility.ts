import express from 'express';
import { z } from 'zod';

import { stringTimingSafeEqual } from '@nangohq/utils';

import { envs } from './env.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { getConversionEligibility } from './services/signupConversions/eligibility.js';

const body = z
    .object({ accountId: z.number().int().positive().safe(), creatorId: z.number().int().positive().safe(), platform: z.enum(['meta', 'chatgpt']) })
    .strict();
const path = '/internal/signup-conversion-eligibility';
export const signupConversionEligibilityAPI = express.Router();

signupConversionEligibilityAPI.post(
    path,
    (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        // Dedicated read-only credential. Never share the general internal API key with a destination.
        const key = envs.SIGNUP_AD_ELIGIBILITY_TOKEN;
        const startAt = envs.SIGNUP_AD_ELIGIBILITY_START_AT;
        if (
            !envs.NANGO_CLOUD ||
            envs.NODE_ENV !== 'production' ||
            !envs.ADVERTISING_CONSENT_ENABLED ||
            !envs.SIGNUP_AD_ELIGIBILITY_ENABLED ||
            !/^[a-f0-9]{64}$/.test(key) ||
            !startAt ||
            !Number.isFinite(Date.parse(startAt))
        ) {
            res.sendStatus(404);
            return;
        }
        const authorization = req.get('authorization');
        if (!authorization || !stringTimingSafeEqual(authorization, `Bearer ${key}`)) {
            res.sendStatus(401);
            return;
        }
        if (!req.is('application/json')) {
            res.sendStatus(415);
            return;
        }
        next();
    },
    rateLimiterMiddleware,
    express.json({ limit: '1kb' }),
    async (req, res) => {
        const parsed = body.safeParse(req.body);
        if (!parsed.success) {
            res.sendStatus(400);
            return;
        }
        try {
            res.json(await getConversionEligibility(parsed.data, new Date(envs.SIGNUP_AD_ELIGIBILITY_START_AT ?? '')));
        } catch {
            // No request context or credentials in errors or logs.
            res.sendStatus(503);
        }
    }
);
