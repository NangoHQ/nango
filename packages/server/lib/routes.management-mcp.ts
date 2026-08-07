import express from 'express';

import { getManagementMcp, postManagementMcp } from './controllers/mcp/management.js';
import { envs } from './env.js';
import authMiddleware from './middleware/access.middleware.js';
import { egressMeterMiddleware } from './middleware/egress-meter.middleware.js';
import { jsonContentTypeMiddleware } from './middleware/json.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';

import type { Request, RequestHandler } from 'express';

const apiAuth: RequestHandler[] = [authMiddleware.secretKeyAuth.bind(authMiddleware), rateLimiterMiddleware, egressMeterMiddleware];
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
managementMcpRouter.route('/mcp').post(apiAuth, postManagementMcp);
managementMcpRouter.route('/mcp').get(apiAuth, getManagementMcp);
managementMcpRouter.use((_, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
});

export const managementMcpAPI: RequestHandler = (req, res, next) => {
    if (!isManagementMcpHost(req.get('host') || '')) {
        next();
        return;
    }

    managementMcpRouter(req, res, next);
};

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
