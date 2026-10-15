import { randomBytes } from 'node:crypto';

import cookieParser from 'cookie-parser';
import express from 'express';
import * as z from 'zod';

import { consentOwnerHash, readAdvertisingConsent, recordAdvertisingConsent } from '@nangohq/shared';
import { isLocal } from '@nangohq/utils';

import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { advertisingConsentConfig, advertisingConsentCookie, readConsentOwner } from './services/advertisingConsent.service.js';

const clickId = z
    .string()
    .min(1)
    .max(512)
    .regex(/^[A-Za-z0-9_.~-]+$/);
export const advertisingConsentBody = z
    .object({
        expectedRevision: z.number().int().min(1).nullable(),
        choice: z
            .object({
                preferences: z.boolean(),
                statistics: z.boolean(),
                marketing: z.boolean(),
                method: z.enum(['explicit', 'implied']).nullable(),
                regulations: z
                    .object({ gdprApplies: z.boolean().nullable(), lgpdApplies: z.boolean().nullable(), ccpaApplies: z.boolean().nullable() })
                    .strict(),
                globalPrivacyControl: z.boolean()
            })
            .strict(),
        clickIds: z
            .object({
                gclid: clickId.optional(),
                gbraid: clickId.optional(),
                wbraid: clickId.optional(),
                fbclid: clickId.optional(),
                msclkid: clickId.optional()
            })
            .strict()
            .optional()
    })
    .strict();

export const advertisingConsentAPI = express.Router();
advertisingConsentAPI.use('/api/v1/advertising-consent', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const config = advertisingConsentConfig();
    if (!config) {
        res.sendStatus(404);
        return;
    }
    // Exact origins and JSON preflight protect writes. No wildcard or missing-origin fallback.
    const origin = req.get('Origin');
    if (!origin || !config.origins.includes(origin)) {
        res.sendStatus(403);
        return;
    }
    res.vary('Origin');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Sec-GPC');
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    if (req.method === 'POST' && !req.is('application/json')) {
        res.sendStatus(415);
        return;
    }
    next();
});
advertisingConsentAPI.use('/api/v1/advertising-consent', cookieParser());
advertisingConsentAPI.get('/api/v1/advertising-consent', rateLimiterMiddleware, async (req, res) => {
    try {
        const owner = readConsentOwner(req);
        const consent = owner ? await readAdvertisingConsent(consentOwnerHash(owner)) : undefined;
        res.send({ data: { revision: consent?.revision || null } });
    } catch {
        res.sendStatus(503);
    }
});
advertisingConsentAPI.post('/api/v1/advertising-consent', rateLimiterMiddleware, express.json({ limit: '4kb' }), async (req, res) => {
    const input = advertisingConsentBody.safeParse(req.body);
    if (!input.success) {
        res.status(400).send({ error: { code: 'invalid_body' } });
        return;
    }
    const config = advertisingConsentConfig();
    if (!config) {
        res.sendStatus(404);
        return;
    }
    const owner = readConsentOwner(req) ?? randomBytes(32).toString('hex');
    try {
        const result = await recordAdvertisingConsent({
            ownerHash: consentOwnerHash(owner),
            // A browser privacy header can only reduce the permission reported in the body.
            choice: { ...input.data.choice, globalPrivacyControl: input.data.choice.globalPrivacyControl || req.get('Sec-GPC') === '1' },
            expectedRevision: input.data.expectedRevision,
            clickIds: input.data.clickIds ?? {},
            lifetimeMs: config.lifetimeMs
        });
        if (!result) {
            res.status(409).send({ error: { code: 'conflict' } });
            return;
        }
        res.cookie(advertisingConsentCookie, owner, { httpOnly: true, secure: !isLocal, sameSite: 'lax', path: '/', maxAge: config.lifetimeMs });
        res.send({ data: result });
    } catch {
        res.sendStatus(503);
    }
});
