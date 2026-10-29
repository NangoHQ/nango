import { resolveEnvironment } from '../authz/middleware.js';
import authMiddleware from './access.middleware.js';
import { egressMeterMiddleware } from './egress-meter.middleware.js';
import { rateLimiterMiddleware } from './ratelimit.middleware.js';

import type { RequestHandler } from 'express';

export const apiAuth: RequestHandler[] = [authMiddleware.secretKeyAuth.bind(authMiddleware), rateLimiterMiddleware, egressMeterMiddleware];

/** Secret-key auth plus the middleware every environment route runs. Task-token routes reuse everything after the auth handler. */
export const envAuth: RequestHandler[] = [...apiAuth, resolveEnvironment];
