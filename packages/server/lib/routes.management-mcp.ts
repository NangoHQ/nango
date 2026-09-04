import express from 'express';

import { baseUrl } from '@nangohq/utils';

import { getManagementMcp, postManagementMcp } from './controllers/mcp/management.js';
import { getManagementOAuthProtectedResourceMetadata, managementOAuthAuth, managementOAuthUnauthorized } from './controllers/mcp/managementOAuth.js';
import { envs } from './env.js';
import authMiddleware from './middleware/access.middleware.js';
import { egressMeterMiddleware } from './middleware/egress-meter.middleware.js';
import { jsonContentTypeMiddleware } from './middleware/json.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { withEnvironmentTarget } from './middleware/scope.middleware.js';

import type { Request, RequestHandler } from 'express';

const apiKeyAuthUnlessOAuth: RequestHandler = (req, res, next) => {
    if (res.locals['authType'] === 'mcpOAuth') {
        next();
        return;
    }
    void authMiddleware.secretKeyAuth(req, res, next);
};
const apiAuth: RequestHandler[] = [managementOAuthAuth, apiKeyAuthUnlessOAuth, rateLimiterMiddleware, egressMeterMiddleware];
const bodyLimit = envs.NANGO_SERVER_PUBLIC_BODY_LIMIT;
const managementMcpRouter = express.Router();

managementMcpRouter.use(
    '/mcp',
    express.json({
        limit: bodyLimit,
        verify: (req: Request, _, buf) => {
            req.rawBody = buf.toString();
        }
    }),
    jsonContentTypeMiddleware
);
managementMcpRouter.get('/.well-known/oauth-protected-resource', getManagementOAuthProtectedResourceMetadata);
managementMcpRouter.get('/.well-known/oauth-protected-resource/mcp', getManagementOAuthProtectedResourceMetadata);
managementMcpRouter.route('/mcp').post(apiAuth, withEnvironmentTarget, postManagementMcp);
managementMcpRouter.route('/mcp').post(managementOAuthUnauthorized);
managementMcpRouter.route('/mcp').get(apiAuth, withEnvironmentTarget, getManagementMcp);
managementMcpRouter.route('/mcp').get(managementOAuthUnauthorized);
managementMcpRouter.use((_, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
});

export const managementMcpAPI: RequestHandler = (req, res, next) => {
    if (!isManagementMcpHost(req.get('host') || '')) {
        next();
        return;
    }
    if (isSharedApiHost() && !isManagementMcpPath(req.path)) {
        next();
        return;
    }

    void managementMcpRouter(req, res, next);
};

function isManagementMcpPath(path: string): boolean {
    return path === '/mcp' || path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp';
}

function isSharedApiHost(): boolean {
    if (!envs.NANGO_MANAGEMENT_MCP_SERVER_URL) {
        return false;
    }
    return new URL(envs.NANGO_MANAGEMENT_MCP_SERVER_URL).hostname.toLowerCase() === new URL(baseUrl).hostname.toLowerCase();
}

function isManagementMcpHost(host: string): boolean {
    if (!envs.NANGO_MANAGEMENT_MCP_SERVER_URL) {
        return false;
    }

    const hostname = host.split(':')[0]?.toLowerCase();
    if (!hostname) {
        return false;
    }

    const managementMcpHostname = new URL(envs.NANGO_MANAGEMENT_MCP_SERVER_URL).hostname.toLowerCase();
    return hostname === managementMcpHostname;
}
