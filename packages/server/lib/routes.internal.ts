import bodyParser from 'body-parser';
import express from 'express';

import { postRollout } from './controllers/fleet/postRollout.js';
import authMiddleware from './middleware/access.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';

import type { RequestHandler } from 'express';

export const internalApi = express.Router();

// --- Body
const bodyLimit = '100kb';
internalApi.use(express.json({ limit: bodyLimit }));
internalApi.use(bodyParser.raw({ limit: bodyLimit }));

const interalApiAuth: RequestHandler[] = [rateLimiterMiddleware, authMiddleware.internal.bind(authMiddleware)];
internalApi.route('/fleet/:fleetId/rollout').post(interalApiAuth, postRollout);
