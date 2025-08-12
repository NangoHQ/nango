import bodyParser from 'body-parser';
import express from 'express';

import { postRollout } from './controllers/fleet/postRollout.js';
import { getSharedCredentialsProviders } from './controllers/v1/integrations/sharedCredentials/getListSharedCredentials.js';
import { getSharedCredentialsProvider } from './controllers/v1/integrations/sharedCredentials/getSharedCredential.js';
import { patchSharedCredentialsProvider } from './controllers/v1/integrations/sharedCredentials/patchSharedCredentialsProvider.js';
import { postSharedCredentialsProvider } from './controllers/v1/integrations/sharedCredentials/postSharedCredentialsProvider.js';
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

internalApi.route('/shared-credentials/providers').get(interalApiAuth, getSharedCredentialsProviders);
internalApi.route('/shared-credentials/providers/:name').get(interalApiAuth, getSharedCredentialsProvider);
internalApi.route('/shared-credentials/providers').post(interalApiAuth, postSharedCredentialsProvider);
internalApi.route('/shared-credentials/providers/:id').patch(interalApiAuth, patchSharedCredentialsProvider);
