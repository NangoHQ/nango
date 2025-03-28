import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import multer from 'multer';

import { connectUrl } from '@nangohq/utils';

import accountController from './controllers/account.controller.js';
import appAuthController from './controllers/appAuth.controller.js';
import { postPublicApiKeyAuthorization } from './controllers/auth/postApiKey.js';
import { postPublicAppStoreAuthorization } from './controllers/auth/postAppStore.js';
import { postPublicBasicAuthorization } from './controllers/auth/postBasic.js';
import { postPublicBillAuthorization } from './controllers/auth/postBill.js';
import { postPublicJwtAuthorization } from './controllers/auth/postJwt.js';
import { postPublicSignatureAuthorization } from './controllers/auth/postSignature.js';
import { postPublicTableauAuthorization } from './controllers/auth/postTableau.js';
import { postPublicTbaAuthorization } from './controllers/auth/postTba.js';
import { postPublicTwoStepAuthorization } from './controllers/auth/postTwoStep.js';
import { postPublicUnauthenticated } from './controllers/auth/postUnauthenticated.js';
import { getPublicListIntegrationsLegacy } from './controllers/config/getListIntegrations.js';
import { deletePublicIntegration } from './controllers/config/providerConfigKey/deleteIntegration.js';
import configController from './controllers/config.controller.js';
import { deleteConnectSession } from './controllers/connect/deleteSession.js';
import { getConnectSession } from './controllers/connect/getSession.js';
import { postConnectSessionsReconnect } from './controllers/connect/postReconnect.js';
import { postConnectSessions } from './controllers/connect/postSessions.js';
import { postConnectTelemetry } from './controllers/connect/postTelemetry.js';
import { deletePublicConnection } from './controllers/connection/connectionId/deleteConnection.js';
import { getPublicConnection } from './controllers/connection/connectionId/getConnection.js';
import { patchPublicMetadata } from './controllers/connection/connectionId/metadata/patchMetadata.js';
import { postPublicMetadata } from './controllers/connection/connectionId/metadata/postMetadata.js';
import { getPublicConnections } from './controllers/connection/getConnections.js';
import connectionController from './controllers/connection.controller.js';
import environmentController from './controllers/environment.controller.js';
import flowController from './controllers/flow.controller.js';
import { getPublicListIntegrations } from './controllers/integrations/getListIntegrations.js';
import { getPublicIntegration } from './controllers/integrations/uniqueKey/getIntegration.js';
import oauthController from './controllers/oauth.controller.js';
import providerController from './controllers/provider.controller.js';
import { getPublicProvider } from './controllers/providers/getProvider.js';
import { getPublicProviders } from './controllers/providers/getProviders.js';
import proxyController from './controllers/proxy.controller.js';
import { getPublicRecords } from './controllers/records/getRecords.js';
import { getPublicScriptsConfig } from './controllers/scripts/config/getScriptsConfig.js';
import { deleteSyncVariant } from './controllers/sync/deleteSyncVariant.js';
import { postDeployConfirmation } from './controllers/sync/deploy/postConfirmation.js';
import { postDeploy } from './controllers/sync/deploy/postDeploy.js';
import { postDeployInternal } from './controllers/sync/deploy/postDeployInternal.js';
import { postSyncVariant } from './controllers/sync/postSyncVariant.js';
import { postPublicTrigger } from './controllers/sync/postTrigger.js';
import syncController from './controllers/sync.controller.js';
import { postWebhook } from './controllers/webhook/environmentUuid/postWebhook.js';
import authMiddleware from './middleware/access.middleware.js';
import { cliMinVersion } from './middleware/cliVersionCheck.js';
import { jsonContentTypeMiddleware } from './middleware/json.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { resourceCapping } from './middleware/resource-capping.middleware.js';
import { isBinaryContentType } from './utils/utils.js';

import type { Request, RequestHandler } from 'express';

const apiAuth: RequestHandler[] = [authMiddleware.secretKeyAuth.bind(authMiddleware), rateLimiterMiddleware];
const connectSessionAuth: RequestHandler[] = [authMiddleware.connectSessionAuth.bind(authMiddleware), rateLimiterMiddleware];
const connectSessionAuthBody: RequestHandler[] = [authMiddleware.connectSessionAuthBody.bind(authMiddleware), rateLimiterMiddleware];
const connectSessionOrApiAuth: RequestHandler[] = [authMiddleware.connectSessionOrSecretKeyAuth.bind(authMiddleware), rateLimiterMiddleware];
const adminAuth: RequestHandler[] = [
    authMiddleware.secretKeyAuth.bind(authMiddleware),
    authMiddleware.adminKeyAuth.bind(authMiddleware),
    rateLimiterMiddleware
];

const connectSessionOrPublicAuth: RequestHandler[] = [
    authMiddleware.connectSessionOrPublicKeyAuth.bind(authMiddleware),
    resourceCapping,
    rateLimiterMiddleware
];

export const publicAPI = express.Router();

const bodyLimit = '75mb';
publicAPI.use(
    express.json({
        limit: bodyLimit,
        verify: (req: Request, _, buf) => {
            req.rawBody = buf.toString();
        }
    })
);
publicAPI.use(
    bodyParser.raw({
        type: (req) => isBinaryContentType(req.headers['content-type']),
        limit: bodyLimit
    })
);
publicAPI.use(bodyParser.raw({ type: 'text/xml', limit: bodyLimit }));
publicAPI.use(express.urlencoded({ extended: true, limit: bodyLimit }));

const upload = multer({ storage: multer.memoryStorage() });

const publicAPICorsHandler = cors({
    maxAge: 600,
    exposedHeaders: 'Authorization, Etag, Content-Type, Content-Length, X-Nango-Signature, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
    allowedHeaders:
        'Authorization, Content-Type, Accept, Origin, X-Requested-With, Nango-Activity-Log-Id, Nango-Is-Dry-Run, Nango-Is-Sync, Provider-Config-Key, Connection-Id, Sentry-Trace, Baggage',
    origin: '*'
});
const publicAPITelemetryCors = cors({
    maxAge: 36000,
    credentials: true,
    exposedHeaders: 'content-type',
    allowedHeaders: 'Authorization, Content-type',
    methods: 'POST',
    origin: connectUrl
});
publicAPI.options('/connect/telemetry', publicAPITelemetryCors);
publicAPI.use('/', publicAPICorsHandler);
publicAPI.options('/', publicAPICorsHandler); // Pre-flight
publicAPI.use('/connect/telemetry', publicAPITelemetryCors);

// API routes (Public key auth).
publicAPI.route('/oauth/callback').get(oauthController.oauthCallback.bind(oauthController));
publicAPI.route('/app-auth/connect').get(appAuthController.connect.bind(appAuthController));

publicAPI.use('/oauth', jsonContentTypeMiddleware);
publicAPI.route('/oauth/connect/:providerConfigKey').get(connectSessionOrPublicAuth, oauthController.oauthRequest.bind(oauthController));
publicAPI.route('/oauth2/auth/:providerConfigKey').post(connectSessionOrPublicAuth, oauthController.oauth2RequestCC.bind(oauthController));
publicAPI.use('/api-auth', jsonContentTypeMiddleware);
publicAPI.route('/api-auth/api-key/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicApiKeyAuthorization);
publicAPI.route('/api-auth/basic/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicBasicAuthorization);
publicAPI.use('/app-store-auth', jsonContentTypeMiddleware);
publicAPI.route('/app-store-auth/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicAppStoreAuthorization);
publicAPI.use('/auth', jsonContentTypeMiddleware);
publicAPI.route('/auth/tba/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicTbaAuthorization);
publicAPI.route('/auth/tableau/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicTableauAuthorization);
publicAPI.route('/auth/two-step/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicTwoStepAuthorization);
publicAPI.route('/auth/jwt/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicJwtAuthorization);
publicAPI.route('/auth/bill/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicBillAuthorization);
publicAPI.route('/auth/signature/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicSignatureAuthorization);
publicAPI.route('/auth/unauthenticated/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicUnauthenticated);

publicAPI.use('/unauth', jsonContentTypeMiddleware);
// @deprecated use /auth/unauthenticated
publicAPI.route('/unauth/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicUnauthenticated);

publicAPI.route('/webhook/:environmentUuid/:providerConfigKey').post(postWebhook);

// API Admin routes
publicAPI.use('/admin', jsonContentTypeMiddleware);
publicAPI.route('/admin/flow/deploy/pre-built').post(adminAuth, flowController.adminDeployPrivateFlow.bind(flowController));
publicAPI.route('/admin/customer').patch(adminAuth, accountController.editCustomer.bind(accountController));

// API routes (Secret key auth).
publicAPI.use('/provider', jsonContentTypeMiddleware);
// @deprecated use /providers
publicAPI.route('/provider').get(apiAuth, providerController.listProviders.bind(providerController));
// @deprecated use /providers
publicAPI.route('/provider/:provider').get(apiAuth, providerController.getProvider.bind(providerController));

publicAPI.use('/providers', jsonContentTypeMiddleware);
publicAPI.route('/providers').get(connectSessionOrApiAuth, getPublicProviders);
publicAPI.route('/providers/:provider').get(connectSessionOrApiAuth, getPublicProvider);

publicAPI.use('/config', jsonContentTypeMiddleware);
// @deprecated
publicAPI.route('/config').get(apiAuth, getPublicListIntegrationsLegacy);
// @deprecated
publicAPI.route('/config/:providerConfigKey').get(apiAuth, configController.getProviderConfig.bind(configController));
publicAPI.route('/config').post(apiAuth, configController.createProviderConfig.bind(configController));
publicAPI.route('/config').put(apiAuth, configController.editProviderConfig.bind(configController));
publicAPI.route('/config/:providerConfigKey').delete(apiAuth, deletePublicIntegration);

publicAPI.use('/integrations', jsonContentTypeMiddleware);
publicAPI.route('/integrations').get(connectSessionOrApiAuth, getPublicListIntegrations);
publicAPI.route('/integrations/:uniqueKey').get(apiAuth, getPublicIntegration);

publicAPI.use('/connection', jsonContentTypeMiddleware);
publicAPI.route('/connection/:connectionId').get(apiAuth, getPublicConnection);
publicAPI.route('/connection').get(apiAuth, getPublicConnections);
publicAPI.route('/connection/:connectionId').delete(apiAuth, deletePublicConnection);
publicAPI.route('/connection/:connectionId/metadata').post(apiAuth, connectionController.setMetadataLegacy.bind(connectionController));
publicAPI.route('/connection/:connectionId/metadata').patch(apiAuth, connectionController.updateMetadataLegacy.bind(connectionController));
publicAPI.route('/connection/metadata').post(apiAuth, postPublicMetadata);
publicAPI.route('/connection/metadata').patch(apiAuth, patchPublicMetadata);
publicAPI.route('/connection').post(apiAuth, connectionController.createConnection.bind(connectionController));

publicAPI.use('/environment-variables', jsonContentTypeMiddleware);
publicAPI.route('/environment-variables').get(apiAuth, environmentController.getEnvironmentVariables.bind(connectionController));

publicAPI.use('/sync', jsonContentTypeMiddleware);
publicAPI.route('/sync/deploy').post(apiAuth, cliMinVersion('0.39.25'), postDeploy);
publicAPI.route('/sync/deploy/confirmation').post(apiAuth, cliMinVersion('0.39.25'), postDeployConfirmation);
publicAPI.route('/sync/deploy/internal').post(apiAuth, postDeployInternal);
publicAPI.route('/sync/update-connection-frequency').put(apiAuth, syncController.updateFrequencyForConnection.bind(syncController));

publicAPI.use('/records', jsonContentTypeMiddleware);
publicAPI.route('/records').get(apiAuth, getPublicRecords);

publicAPI.use('/sync', jsonContentTypeMiddleware);
publicAPI.route('/sync/trigger').post(apiAuth, postPublicTrigger);
publicAPI.route('/sync/pause').post(apiAuth, syncController.pause.bind(syncController));
publicAPI.route('/sync/start').post(apiAuth, syncController.start.bind(syncController));
publicAPI.route('/sync/status').get(apiAuth, syncController.getSyncStatus.bind(syncController));
publicAPI.route('/sync/:name/variant/:variant').post(apiAuth, postSyncVariant);
publicAPI.route('/sync/:name/variant/:variant').delete(apiAuth, deleteSyncVariant);

publicAPI.use('/flow', jsonContentTypeMiddleware);
publicAPI.route('/flow/attributes').get(apiAuth, syncController.getFlowAttributes.bind(syncController));
publicAPI.route('/flow/configs').get(apiAuth, getPublicScriptsConfig);

publicAPI.use('/scripts', jsonContentTypeMiddleware);
// @deprecated use /flow/configs
publicAPI.route('/scripts/config').get(apiAuth, getPublicScriptsConfig);

publicAPI.use('/action', jsonContentTypeMiddleware);
publicAPI.route('/action/trigger').post(apiAuth, syncController.triggerAction.bind(syncController)); //TODO: to deprecate

publicAPI.use('/connect', jsonContentTypeMiddleware);
publicAPI.route('/connect/sessions').post(apiAuth, postConnectSessions);
publicAPI.route('/connect/sessions/reconnect').post(apiAuth, postConnectSessionsReconnect);
publicAPI.route('/connect/session').get(connectSessionAuth, getConnectSession);
publicAPI.route('/connect/session').delete(connectSessionAuth, deleteConnectSession);
publicAPI.route('/connect/telemetry').post(connectSessionAuthBody, postConnectTelemetry);

publicAPI.use('/v1', jsonContentTypeMiddleware);
publicAPI.route('/v1/*').all(apiAuth, syncController.actionOrModel.bind(syncController));

publicAPI.route('/proxy/*').all(apiAuth, upload.any(), proxyController.routeCall.bind(proxyController));
