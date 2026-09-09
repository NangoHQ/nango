import express from 'express';

import { OAUTH_AUTHORIZATION_PATH, OAUTH_DISCOVERY_PATH, OAUTH_JWKS_PATH, OAUTH_REVOCATION_PATH, OAUTH_TOKEN_PATH } from '@nangohq/oauth-server';

import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { oauthServer } from './oauth/server.js';

import type { RequestHandler } from 'express';

export const oauthServerAPI = express.Router();

const providerHandlers: RequestHandler[] = oauthServer
    ? [rateLimiterMiddleware, asExpressHandler(oauthServer.callback())]
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

// TODO(NAN-6924): Add the authenticated interaction API and React consent flow.
// Keeping the protocol routes explicit prevents this router from intercepting Nango's existing /oauth/* routes.

function asExpressHandler(providerCallback: ReturnType<NonNullable<typeof oauthServer>['callback']>): RequestHandler {
    return (req, res, next) => {
        void providerCallback(req, res).catch(next);
    };
}
