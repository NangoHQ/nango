import cors from 'cors';
import express from 'express';

import { OAUTH_AUTHORIZATION_PATH, OAUTH_DISCOVERY_PATH, OAUTH_JWKS_PATH, OAUTH_REVOCATION_PATH, OAUTH_TOKEN_PATH } from '@nangohq/oauth-server';

import { setupAuth } from './clients/auth.client.js';
import { auditOAuthApproved, auditOAuthDenied } from './middleware/audit/index.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import {
    approveOAuthInteraction,
    authenticateOAuthSession,
    denyOAuthInteraction,
    enterOAuthInteraction,
    oauthParsingError,
    readOAuthInteraction
} from './oauth/handlers.js';
import { oauthConsent, oauthServer } from './oauth/server.js';

import type { RequestHandler } from 'express';

export const oauthServerAPI = express.Router();
const browserSession = express.Router();
setupAuth(browserSession);

const issuerOnly: RequestHandler = (req, res, next) => {
    const issuer = oauthServer ? new URL(oauthServer.issuer) : null;
    const forwardedHost = req.get('x-forwarded-host');
    // Koa's provider uses forwarded host information when building resume URLs. Validate
    // that too, so a spoofed forwarding header cannot turn a valid Host into another issuer.
    if (!issuer || req.get('host') !== issuer.host || (forwardedHost && forwardedHost !== issuer.host) || req.protocol !== issuer.protocol.slice(0, -1)) {
        res.status(404).json({ error: { code: 'not_found' } });
        return;
    }
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    next();
};

// Only mount on owned paths; legacy integration OAuth routes keep their own router.
oauthServerAPI.use(
    '/oauth/interaction',
    issuerOnly,
    browserSession,
    cors({ origin: oauthConsent?.dashboardOrigin ?? false, credentials: true, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'], maxAge: 600 }),
    rateLimiterMiddleware,
    express.json({ limit: '8kb' })
);
oauthServerAPI.use('/oauth/interaction', oauthParsingError);
oauthServerAPI.get('/oauth/interaction/:uid', enterOAuthInteraction);
oauthServerAPI.get('/oauth/interaction/:uid/details', readOAuthInteraction);
oauthServerAPI.post('/oauth/interaction/:uid/approve', authenticateOAuthSession, auditOAuthApproved, approveOAuthInteraction);
oauthServerAPI.post('/oauth/interaction/:uid/deny', authenticateOAuthSession, auditOAuthDenied, denyOAuthInteraction);

const providerHandlers: RequestHandler[] = oauthServer
    ? [issuerOnly, rateLimiterMiddleware, asExpressHandler(oauthServer.callback())]
    : [(_req, res) => void res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })];

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
