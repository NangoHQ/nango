import express from 'express';
import passport from 'passport';

import {
    OAUTH_AUTHORIZATION_PATH,
    OAUTH_DISCOVERY_PATH,
    OAUTH_JWKS_PATH,
    OAUTH_REVOCATION_PATH,
    OAUTH_SESSION_END_CONFIRM_PATH,
    OAUTH_TOKEN_PATH
} from '@nangohq/oauth-server';
import { userService } from '@nangohq/shared';
import { flagHasAuth, isBasicAuthEnabled } from '@nangohq/utils';

import { setupAuth } from './clients/auth.client.js';
import { envs } from './env.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { approveOAuthConsent, completeOAuthLogin, denyOAuthConsent, getOAuthConsentInteraction, oauthConsentCors } from './oauth/interaction.controller.js';
import { oauthServer } from './oauth/server.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const oauthServerAPI = express.Router();
const oauthConsentAPI = express.Router();
setupAuth(oauthConsentAPI);

// Consent needs a dashboard identity, but it is not scoped to a Nango environment. Reuse the
// configured Passport strategy without the private API middleware that also requires `?env=`.
const oauthDashboardAuth: RequestHandler[] = flagHasAuth
    ? []
    : isBasicAuthEnabled
      ? [passport.authenticate('basic', { session: false }) as RequestHandler, addAuthenticationTime]
      : [authenticateNoAuth, addAuthenticationTime];

const providerHandlers: RequestHandler[] = oauthServer
    ? [requireIssuerHost, rateLimiterMiddleware, asExpressHandler(oauthServer.callback())]
    : [(_req, res) => void res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })];

const interactionHandlers = (handler: RequestHandler, authentication: RequestHandler[] = []): RequestHandler[] =>
    oauthServer
        ? [requireIssuerHost, ...authentication, rateLimiterMiddleware, handler]
        : [(_req, res) => void res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })];

oauthConsentAPI.options('/:uid', requireIssuerHost, oauthConsentCors);
oauthConsentAPI.options('/:uid/:decision', requireIssuerHost, oauthConsentCors);
oauthConsentAPI.get('/:uid', oauthConsentCors, ...interactionHandlers(getOAuthConsentInteraction, oauthDashboardAuth));
oauthConsentAPI.post('/:uid/login', oauthConsentCors, express.json({ limit: '4kb' }), ...interactionHandlers(completeOAuthLogin, oauthDashboardAuth));
oauthConsentAPI.post('/:uid/approve', oauthConsentCors, express.json({ limit: '4kb' }), ...interactionHandlers(approveOAuthConsent));
oauthConsentAPI.post('/:uid/deny', oauthConsentCors, express.json({ limit: '4kb' }), ...interactionHandlers(denyOAuthConsent));
oauthServerAPI.use('/oauth/consent', oauthConsentAPI);

oauthServerAPI.get(OAUTH_DISCOVERY_PATH, ...providerHandlers);
oauthServerAPI.options(OAUTH_DISCOVERY_PATH, ...providerHandlers);
oauthServerAPI.get(OAUTH_AUTHORIZATION_PATH, ...providerHandlers);
oauthServerAPI.get(`${OAUTH_AUTHORIZATION_PATH}/:uid`, ...providerHandlers);
oauthServerAPI.post(OAUTH_TOKEN_PATH, ...providerHandlers);
oauthServerAPI.options(OAUTH_TOKEN_PATH, ...providerHandlers);
oauthServerAPI.post(OAUTH_REVOCATION_PATH, ...providerHandlers);
oauthServerAPI.options(OAUTH_REVOCATION_PATH, ...providerHandlers);
oauthServerAPI.post(OAUTH_SESSION_END_CONFIRM_PATH, ...providerHandlers);
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

function addAuthenticationTime(req: Request, _res: Response, next: NextFunction): void {
    if (req.user) {
        // Basic and no-auth modes authenticate on this request rather than through a persisted dashboard login session.
        req.user.authenticated_at = Date.now() / 1000;
    }
    next();
}

async function authenticateNoAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.isAuthenticated()) {
        next();
        return;
    }
    try {
        const userId = envs.LOCAL_NANGO_USER_ID ?? 0;
        const user = await userService.getUserById(userId);
        if (!user) {
            res.status(500).send({ error: { code: 'server_error', message: 'failed to find user in no-auth mode' } });
            return;
        }
        req.login(user, (err) => {
            if (err) {
                next(err);
                return;
            }
            next();
        });
    } catch (err) {
        next(err);
    }
}
