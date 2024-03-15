import { initAuth } from '@propelauth/express';
import passport from 'passport';

import accessMiddleware from './access.middleware.js';
import { rateLimiterMiddleware } from './ratelimit.middleware.js';
import { AUTH_ENABLED } from '../controllers/account.controller.js';
import { isBasicAuthEnabled } from '@nangohq/shared';

let requireUser;
const useHostedAuth = process.env['USE_HOSTED_AUTH'] === 'true';

if (useHostedAuth) {
    const auth = initAuth({
        authUrl: process.env['HOSTED_AUTH_URL'] as string,
        apiKey: process.env['HOSTED_AUTH_API_KEY'] as string
    });
    requireUser = auth.requireUser;
}

const rateLimitingMiddleware = [rateLimiterMiddleware];

const hostedAuthMiddleware = useHostedAuth
    ? [requireUser, ...rateLimitingMiddleware]
    : [passport.authenticate('session'), accessMiddleware.sessionAuth.bind(accessMiddleware), ...rateLimitingMiddleware];

const selfHostedAuthMiddleware = isBasicAuthEnabled()
    ? [passport.authenticate('basic', { session: false }), accessMiddleware.basicAuth.bind(accessMiddleware), ...rateLimitingMiddleware]
    : [accessMiddleware.noAuth.bind(accessMiddleware), ...rateLimitingMiddleware];

export const webAuth = AUTH_ENABLED ? hostedAuthMiddleware : selfHostedAuthMiddleware;
export const apiAuth = [accessMiddleware.secretKeyAuth.bind(accessMiddleware), rateLimiterMiddleware];
export const apiPublicAuth = [accessMiddleware.publicKeyAuth.bind(accessMiddleware), rateLimiterMiddleware];
