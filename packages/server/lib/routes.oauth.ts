import express from 'express';

import { OAUTH_AUTHORIZATION_PATH, OAUTH_DISCOVERY_PATH, OAUTH_JWKS_PATH, OAUTH_REVOCATION_PATH, OAUTH_TOKEN_PATH } from '@nangohq/oauth-server';

import { auditOAuthGrantApproved, auditOAuthGrantDenied } from './middleware/audit/index.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import {
    approveOAuthConsent,
    consumeOAuthLoginHandoff,
    denyOAuthConsent,
    getOAuthConsentInteraction,
    oauthConsentCors
} from './oauth/interaction.controller.js';
import { oauthServer } from './oauth/server.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const oauthServerAPI = express.Router();

const providerHandlers: RequestHandler[] = oauthServer
    ? [requireIssuerHost, rateLimiterMiddleware, asExpressHandler(oauthServer.callback())]
    : [(_req, res) => void res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })];

const interactionHandlers = (handler: RequestHandler, audit?: RequestHandler): RequestHandler[] =>
    oauthServer
        ? [requireIssuerHost, rateLimiterMiddleware, ...(audit ? [audit] : []), handler]
        : [(_req, res) => void res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })];

oauthServerAPI.options('/oauth/consent/:uid', requireIssuerHost, oauthConsentCors);
oauthServerAPI.options('/oauth/consent/:uid/:decision', requireIssuerHost, oauthConsentCors);
oauthServerAPI.get('/oauth/consent/:uid', oauthConsentCors, ...interactionHandlers(getOAuthConsentInteraction));
oauthServerAPI.post(
    '/oauth/consent/:uid/approve',
    oauthConsentCors,
    express.json({ limit: '4kb' }),
    ...interactionHandlers(approveOAuthConsent, auditOAuthGrantApproved)
);
oauthServerAPI.post(
    '/oauth/consent/:uid/deny',
    oauthConsentCors,
    express.json({ limit: '4kb' }),
    ...interactionHandlers(denyOAuthConsent, auditOAuthGrantDenied)
);
oauthServerAPI.post('/oauth/consent/:uid/handoff', express.urlencoded({ extended: false, limit: '4kb' }), ...interactionHandlers(consumeOAuthLoginHandoff));

oauthServerAPI.get(OAUTH_DISCOVERY_PATH, ...providerHandlers);
oauthServerAPI.options(OAUTH_DISCOVERY_PATH, ...providerHandlers);
oauthServerAPI.get(OAUTH_AUTHORIZATION_PATH, ...providerHandlers);
oauthServerAPI.get(`${OAUTH_AUTHORIZATION_PATH}/:uid`, ...providerHandlers);
oauthServerAPI.post(OAUTH_TOKEN_PATH, ...providerHandlers);
oauthServerAPI.options(OAUTH_TOKEN_PATH, ...providerHandlers);
oauthServerAPI.post(OAUTH_REVOCATION_PATH, ...providerHandlers);
oauthServerAPI.options(OAUTH_REVOCATION_PATH, ...providerHandlers);
oauthServerAPI.get(OAUTH_JWKS_PATH, ...providerHandlers);
oauthServerAPI.options(OAUTH_JWKS_PATH, ...providerHandlers);

// Keeping the protocol routes explicit prevents this router from intercepting Nango's existing /oauth/* routes.

function asExpressHandler(providerCallback: ReturnType<NonNullable<typeof oauthServer>['callback']>): RequestHandler {
    return (req, res, next) => {
        void providerCallback(req, res).catch(next);
    };
}

function requireIssuerHost(req: Request, res: Response, next: NextFunction): void {
    if (!oauthServer || req.get('host')?.toLowerCase() !== new URL(oauthServer.issuer).host.toLowerCase()) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
        return;
    }
    next();
}
