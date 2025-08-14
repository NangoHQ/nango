import bodyParser from 'body-parser';
import express from 'express';

import { postRollout } from './controllers/fleet/postRollout.js';
import { getSharedCredentialsProviders } from './controllers/sharedCredentials/getListSharedCredentials.js';
import { getSharedCredentialsProvider } from './controllers/sharedCredentials/id/getSharedCredential.js';
import { patchSharedCredentialsProvider } from './controllers/sharedCredentials/id/patchSharedCredential.js';
import { postSharedCredentialsProvider } from './controllers/sharedCredentials/postSharedCredential.js';
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

internalApi.route('/shared-credentials').get(interalApiAuth, getSharedCredentialsProviders);
internalApi.route('/shared-credentials/:id').get(interalApiAuth, getSharedCredentialsProvider);
internalApi.route('/shared-credentials').post(interalApiAuth, postSharedCredentialsProvider);
internalApi.route('/shared-credentials/:id').patch(interalApiAuth, patchSharedCredentialsProvider);
