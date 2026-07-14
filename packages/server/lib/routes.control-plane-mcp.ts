import express from 'express';

import { getControlPlaneMcp, postControlPlaneMcp } from './controllers/mcp/controlPlane.js';
import { envs } from './env.js';
import authMiddleware from './middleware/access.middleware.js';
import { egressMeterMiddleware } from './middleware/egress-meter.middleware.js';
import { jsonContentTypeMiddleware } from './middleware/json.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';

import type { Request, RequestHandler } from 'express';

const apiAuth: RequestHandler[] = [authMiddleware.secretKeyAuth.bind(authMiddleware), rateLimiterMiddleware, egressMeterMiddleware];
const bodyLimit = envs.NANGO_SERVER_PUBLIC_BODY_LIMIT;
const controlPlaneMcpRouter = express.Router();

controlPlaneMcpRouter.use(
    '/mcp',
    express.json({
        limit: bodyLimit,
        verify: (req: Request, _, buf) => {
            req.rawBody = buf.toString();
        }
    }),
    jsonContentTypeMiddleware
);
controlPlaneMcpRouter.route('/mcp').post(apiAuth, postControlPlaneMcp);
controlPlaneMcpRouter.route('/mcp').get(apiAuth, getControlPlaneMcp);
controlPlaneMcpRouter.use((_, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
});

export const controlPlaneMcpAPI: RequestHandler = (req, res, next) => {
    if (!isControlPlaneMcpHost(req.get('host') || '')) {
        next();
        return;
    }

    controlPlaneMcpRouter(req, res, next);
};

function isControlPlaneMcpHost(host: string): boolean {
    if (!envs.NANGO_CONTROL_PLANE_MCP_SERVER_URL) {
        return false;
    }

    const hostname = host.split(':')[0]?.toLowerCase();
    if (!hostname) {
        return false;
    }

    const controlPlaneMcpHostname = new URL(envs.NANGO_CONTROL_PLANE_MCP_SERVER_URL).hostname.toLowerCase();
    return hostname === controlPlaneMcpHostname;
}
