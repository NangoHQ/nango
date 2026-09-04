import cors from 'cors';
import express from 'express';
import passport from 'passport';

import { userService } from '@nangohq/shared';
import { flagHasAuth, getLogger, isBasicAuthEnabled, metrics } from '@nangohq/utils';

import { setupAuth } from './clients/auth.client.js';
import { getManagementOAuthAuthorizationServerMetadata } from './controllers/mcp/managementOAuth.js';
import { getManagementMcpOAuthConfig, isManagementMcpOAuthEnabled } from './controllers/mcp/oauth/config.js';
import {
    getManagementMcpOAuthInteraction,
    postManagementMcpOAuthInteractionApprove,
    postManagementMcpOAuthInteractionDeny,
    requireManagementMcpOAuthInteractionOrigin
} from './controllers/mcp/oauth/interaction.js';
import { getManagementMcpOAuthProvider } from './controllers/mcp/oauth/provider.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { isAllowedWebCorsOrigin } from './utils/cors.js';

import type { ErrorRequestHandler, RequestHandler } from 'express';

export const managementMcpOAuthAPI = express.Router();
const logger = getLogger('Server.ManagementMcpOAuth.Routes');

managementMcpOAuthAPI.use((_, __, next) => {
    if (!isManagementMcpOAuthEnabled()) {
        next('router');
        return;
    }
    next();
});
managementMcpOAuthAPI.use((req, _, next) => {
    if (req.path !== '/.well-known/oauth-authorization-server/oauth/management-mcp' && !req.path.startsWith('/oauth/management-mcp')) {
        next('router');
        return;
    }
    next();
});
managementMcpOAuthAPI.use((req, res, next) => {
    const startedAt = Date.now();
    res.once('finish', () => {
        metrics.duration(metrics.Types.MCP_OAUTH_ENDPOINT_DURATION, Date.now() - startedAt, {
            endpoint: classifyOAuthEndpoint(req.path),
            status: res.statusCode
        });
    });
    next();
});

setupAuth(managementMcpOAuthAPI);

const interactionCors = cors({
    maxAge: 600,
    allowedHeaders: 'Origin, Content-Type',
    origin: (origin, callback) => callback(null, isAllowedWebCorsOrigin(origin)),
    credentials: true
});
const interactionAuth: RequestHandler = flagHasAuth
    ? (passport.authenticate('session') as RequestHandler)
    : isBasicAuthEnabled
      ? (passport.authenticate('basic', { session: false }) as RequestHandler)
      : async (req, res, next) => {
            if (req.isAuthenticated()) {
                next();
                return;
            }
            const userId = process.env['LOCAL_NANGO_USER_ID'] ? Number(process.env['LOCAL_NANGO_USER_ID']) : 0;
            const user = await userService.getUserById(userId);
            if (!user) {
                res.status(401).json({ error: { code: 'unauthorized', message: 'Local Nango user not found.' } });
                return;
            }
            req.login(user, (err) => {
                if (err) {
                    next(err);
                    return;
                }
                next();
            });
        };

managementMcpOAuthAPI.get('/.well-known/oauth-authorization-server/oauth/management-mcp', getManagementOAuthAuthorizationServerMetadata);
managementMcpOAuthAPI.options('/oauth/management-mcp/interaction/:uid', interactionCors);
managementMcpOAuthAPI.options('/oauth/management-mcp/interaction/:uid/approve', interactionCors);
managementMcpOAuthAPI.options('/oauth/management-mcp/interaction/:uid/deny', interactionCors);
managementMcpOAuthAPI.get('/oauth/management-mcp/interaction/:uid', interactionCors, rateLimiterMiddleware, interactionAuth, getManagementMcpOAuthInteraction);
managementMcpOAuthAPI.post(
    '/oauth/management-mcp/interaction/:uid/approve',
    interactionCors,
    rateLimiterMiddleware,
    interactionAuth,
    express.json({ limit: '16kb' }),
    requireManagementMcpOAuthInteractionOrigin,
    postManagementMcpOAuthInteractionApprove
);
managementMcpOAuthAPI.post(
    '/oauth/management-mcp/interaction/:uid/deny',
    interactionCors,
    rateLimiterMiddleware,
    interactionAuth,
    express.json({ limit: '16kb' }),
    requireManagementMcpOAuthInteractionOrigin,
    postManagementMcpOAuthInteractionDeny
);

managementMcpOAuthAPI.post(
    '/oauth/management-mcp/token',
    express.text({ type: 'application/x-www-form-urlencoded', limit: '56kb' }),
    requireManagementMcpOAuthTokenResource
);

managementMcpOAuthAPI.use('/oauth/management-mcp', rateLimiterMiddleware, (req, res, next) => {
    const provider = getManagementMcpOAuthProvider();
    if (!provider) {
        next();
        return;
    }
    const callback = provider.callback();
    void callback(req, res).catch((err) => {
        logger.error('Management MCP OAuth provider callback failed', { err });
        next(err);
    });
});

function requireManagementMcpOAuthTokenResource(
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
    next: Parameters<RequestHandler>[2]
): void {
    if (!req.is('application/x-www-form-urlencoded')) {
        next();
        return;
    }
    const body = typeof req.body === 'string' ? new URLSearchParams(req.body) : null;
    const resources = body?.getAll('resource') ?? [];
    const expectedResource = getManagementMcpOAuthConfig().resource;
    if (resources.length === 0 || resources.some((resource) => resource !== expectedResource)) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(400).json({ error: 'invalid_target', error_description: 'The management MCP resource parameter is required' });
        return;
    }
    next();
}

managementMcpOAuthAPI.use('/oauth/management-mcp', (_, res) => {
    const config = getManagementMcpOAuthConfig();
    res.status(404).json({ error: 'not_found', issuer: config.issuer });
});

const logManagementMcpOAuthError: ErrorRequestHandler = (err, _, __, next) => {
    logger.error('Management MCP OAuth route failed', { err });
    next(err);
};
managementMcpOAuthAPI.use(logManagementMcpOAuthError);

function classifyOAuthEndpoint(path: string): string {
    if (path.includes('/interaction/')) {
        return path.endsWith('/approve') ? 'interaction_approve' : path.endsWith('/deny') ? 'interaction_deny' : 'interaction';
    }
    if (path.includes('/.well-known/')) {
        return 'metadata';
    }
    return path.split('/').filter(Boolean).at(-1) ?? 'unknown';
}
