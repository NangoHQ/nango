import { resolveEnvironment } from '../authz/middleware.js';
import authMiddleware from './access.middleware.js';
import { egressMeterMiddleware } from './egress-meter.middleware.js';
import { rateLimiterMiddleware } from './ratelimit.middleware.js';

import type { RequestHandler } from 'express';

const metered: RequestHandler[] = [rateLimiterMiddleware, egressMeterMiddleware];

export const apiAuth: RequestHandler[] = [authMiddleware.secretKeyAuth.bind(authMiddleware), ...metered];

/** Secret-key auth plus environment resolution. */
export const envAuth: RequestHandler[] = [...apiAuth, resolveEnvironment];

/** Rate limit, egress metering, and environment resolution. Task-token routes run this after their own auth. */
export const afterCredentialAuth: RequestHandler[] = [...metered, resolveEnvironment];
