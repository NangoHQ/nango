import bodyParser from 'body-parser';
import express from 'express';

import { xSignupRouter } from './controllers/analytics/xSignup.js';
import { postRollout } from './controllers/fleet/postRollout.js';
import { getSharedCredentialsProviders } from './controllers/sharedCredentials/getListSharedCredentials.js';
import { getSharedCredentialsProvider } from './controllers/sharedCredentials/id/getSharedCredential.js';
import { patchSharedCredentialsProvider } from './controllers/sharedCredentials/id/patchSharedCredential.js';
import { postSharedCredentialsProvider } from './controllers/sharedCredentials/postSharedCredential.js';
import { getUsersProvider } from './controllers/users/getUsersProvider.js';
import authMiddleware from './middleware/access.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';

import type { RequestHandler } from 'express';

export const internalApi = express.Router();

// Route-specific bounded parser and dedicated auth must precede general internal parsers.
internalApi.use('/analytics/x-signup', xSignupRouter);

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

internalApi.route('/users').get(interalApiAuth, getUsersProvider);
