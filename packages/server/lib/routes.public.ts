import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import multer from 'multer';

import { connectUrl, flagEnforceCLIVersion } from '@nangohq/utils';

import { getAsyncActionResult } from './controllers/action/getAsyncActionResult.js';
import { postPublicTriggerAction } from './controllers/action/postTriggerAction.js';
import appAuthController from './controllers/appAuth.controller.js';
import { postPublicApiKeyAuthorization } from './controllers/auth/postApiKey.js';
import { postPublicAppStoreAuthorization } from './controllers/auth/postAppStore.js';
import { postPublicAwsSigV4Authorization } from './controllers/auth/postAwsSigV4.js';
import { postPublicBasicAuthorization } from './controllers/auth/postBasic.js';
import { postPublicBillAuthorization } from './controllers/auth/postBill.js';
import { postPublicJwtAuthorization } from './controllers/auth/postJwt.js';
import { postPublicOauthOutboundAuthorization } from './controllers/auth/postOauthOutbound.js';
import { postPublicSignatureAuthorization } from './controllers/auth/postSignature.js';
import { postPublicTbaAuthorization } from './controllers/auth/postTba.js';
import { postPublicTwoStepAuthorization } from './controllers/auth/postTwoStep.js';
import { postPublicUnauthenticated } from './controllers/auth/postUnauthenticated.js';
import { getClientMetadata } from './controllers/clientMetadata/environmentUuid/getClientMetadata.js';
import configController from './controllers/config.controller.js';
import { deleteConnectSession } from './controllers/connect/deleteSession.js';
import { getConnectSession } from './controllers/connect/getSession.js';
import { postConnectSessionsReconnect } from './controllers/connect/postReconnect.js';
import { postConnectSessions } from './controllers/connect/postSessions.js';
import { postConnectTelemetry } from './controllers/connect/postTelemetry.js';
import connectionController from './controllers/connection.controller.js';
import { deletePublicConnection } from './controllers/connection/connectionId/deleteConnection.js';
import { getPublicConnection } from './controllers/connection/connectionId/getConnection.js';
import { patchPublicMetadata } from './controllers/connection/connectionId/metadata/patchMetadata.js';
import { postPublicMetadata } from './controllers/connection/connectionId/metadata/postMetadata.js';
import { patchPublicConnection } from './controllers/connection/connectionId/patchConnection.js';
import { getPublicConnections } from './controllers/connection/getConnections.js';
import { postPublicConnection } from './controllers/connection/postConnection.js';
import { getPublicEnvironmentVariables } from './controllers/environment/getVariables.js';
import { postFunctionCompile } from './controllers/functions/compile/postCompile.js';
import { getFunctionDeployment } from './controllers/functions/deploy/getDeployment.js';
import { postFunctionDeployment } from './controllers/functions/deploy/postDeploy.js';
import { postFunctionDeploymentResult } from './controllers/functions/deploy/postDeployResult.js';
import { getFunctionDryrun } from './controllers/functions/dryrun/getDryrun.js';
import { postFunctionDryrun } from './controllers/functions/dryrun/postDryrun.js';
import { postFunctionDryrunResult } from './controllers/functions/dryrun/postDryrunResult.js';
import { getPublicListIntegrations } from './controllers/integrations/getListIntegrations.js';
import { postPublicIntegration, postPublicQuickstartIntegration } from './controllers/integrations/postIntegration.js';
import { deletePublicIntegration } from './controllers/integrations/uniqueKey/deleteIntegration.js';
import { deletePublicIntegrationFunction } from './controllers/integrations/uniqueKey/functions/deleteFunction.js';
import { getFunctionCode } from './controllers/integrations/uniqueKey/functions/getCode.js';
import { getPublicIntegrationFunction } from './controllers/integrations/uniqueKey/functions/getFunction.js';
import { getPublicIntegrationFunctions } from './controllers/integrations/uniqueKey/functions/getFunctions.js';
import { getPublicIntegration } from './controllers/integrations/uniqueKey/getIntegration.js';
import { patchPublicIntegration } from './controllers/integrations/uniqueKey/patchIntegration.js';
import { getConnectionToolsMcp, postConnectionToolsMcp } from './controllers/mcp/connectionTools.js';
import oauthController from './controllers/oauth.controller.js';
import { getPublicProvider } from './controllers/providers/getProvider.js';
import { getPublicProviders } from './controllers/providers/getProviders.js';
import { getPublicProviderTemplates } from './controllers/providers/provider/templates/getTemplates.js';
import { allPublicProxy } from './controllers/proxy/allProxy.js';
import { getPublicRecords } from './controllers/records/getRecords.js';
import { patchPublicPruneRecords } from './controllers/records/patchPruneRecords.js';
import { getPublicScriptsConfig } from './controllers/scripts/config/getScriptsConfig.js';
import { deleteSyncVariant } from './controllers/sync/deleteSyncVariant.js';
import { postDeployConfirmation } from './controllers/sync/deploy/postConfirmation.js';
import { postDeploy } from './controllers/sync/deploy/postDeploy.js';
import { postDeployInternal } from './controllers/sync/deploy/postDeployInternal.js';
import { getPublicSyncStatus } from './controllers/sync/getSyncStatus.js';
import { postPublicSyncPause } from './controllers/sync/postSyncPause.js';
import { postPublicSyncStart } from './controllers/sync/postSyncStart.js';
import { postSyncVariant } from './controllers/sync/postSyncVariant.js';
import { postPublicTrigger } from './controllers/sync/postTrigger.js';
import { putSyncConnectionFrequency } from './controllers/sync/putSyncConnectionFrequency.js';
import { allPublicV1 } from './controllers/v1/getV1.js';
import { postWebhook } from './controllers/webhook/environmentUuid/postWebhook.js';
import { envs } from './env.js';
import { acceptLanguageMiddleware } from './middleware/accept-language.middleware.js';
import authMiddleware from './middleware/access.middleware.js';
import { auditConnectionDeleted } from './middleware/audit.middleware.js';
import { cliMaxVersion, cliMinVersion } from './middleware/cliVersionCheck.js';
import { connectionCapping } from './middleware/connection-capping.middleware.js';
import { egressMeterMiddleware } from './middleware/egress-meter.middleware.js';
import { jsonContentTypeMiddleware } from './middleware/json.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { withAnyScope, withScope } from './middleware/scope.middleware.js';
import { webhookIngressRateLimit } from './middleware/webhook-ingress-ratelimit.middleware.js';
import { isBinaryContentType } from './utils/utils.js';

import type { Request, RequestHandler } from 'express';

const apiAuth: RequestHandler[] = [authMiddleware.secretKeyAuth.bind(authMiddleware), rateLimiterMiddleware, egressMeterMiddleware];
const connectSessionAuth: RequestHandler[] = [authMiddleware.connectSessionAuth.bind(authMiddleware), rateLimiterMiddleware, egressMeterMiddleware];
const connectSessionAuthBody: RequestHandler[] = [authMiddleware.connectSessionAuthBody.bind(authMiddleware), rateLimiterMiddleware, egressMeterMiddleware];
const connectSessionOrApiAuth: RequestHandler[] = [
    authMiddleware.connectSessionOrSecretKeyAuth.bind(authMiddleware),
    rateLimiterMiddleware,
    egressMeterMiddleware
];
const connectSessionOrPublicAuth: RequestHandler[] = [
    authMiddleware.connectSessionOrPublicKeyAuth.bind(authMiddleware),
    rateLimiterMiddleware,
    egressMeterMiddleware
];

const functionCompileAuth: RequestHandler[] = [...apiAuth, withScope('environment:functions:compile')];
const functionDryrunAuth: RequestHandler[] = [...apiAuth, withScope('environment:functions:dryrun')];
const sandboxTokenOnly: RequestHandler = (_req, res, next) => {
    if (res.locals['apiKeyAuthSource'] !== 'sandbox_token') {
        res.status(403).send({ error: { code: 'forbidden', message: 'This endpoint only accepts sandbox tokens' } });
        return;
    }

    next();
};
const functionDryrunResultAuth: RequestHandler[] = [...apiAuth, sandboxTokenOnly];
const functionDeployAuth: RequestHandler[] = [...apiAuth, withScope('environment:deploy')];
const functionDeploymentResultAuth: RequestHandler[] = [...apiAuth, sandboxTokenOnly];

export const publicAPI = express.Router();

const bodyLimit = envs.NANGO_SERVER_PUBLIC_BODY_LIMIT;

if (flagEnforceCLIVersion) {
    publicAPI.use(cliMaxVersion());
}

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

type ExtendedMulterLimits = multer.Options['limits'] & {
    fieldNestingDepth?: number;
};
const upload = multer({ storage: multer.memoryStorage(), limits: { fieldNestingDepth: 50 } as ExtendedMulterLimits });

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
publicAPI.route('/oauth/callback').get(cookieParser(), oauthController.oauthCallback.bind(oauthController));
publicAPI.route('/oauth/client-metadata/:environmentUuid/:providerConfigKey').get(getClientMetadata);
publicAPI.route('/app-auth/connect').get(appAuthController.connect.bind(appAuthController));

publicAPI.use('/oauth', jsonContentTypeMiddleware);
publicAPI.route('/oauth/connect/:providerConfigKey').get(connectSessionOrPublicAuth, oauthController.oauthRequest.bind(oauthController));
publicAPI.route('/oauth2/auth/:providerConfigKey').post(connectSessionOrPublicAuth, oauthController.oauth2RequestCC.bind(oauthController));
publicAPI.route('/auth/oauth-outbound/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicOauthOutboundAuthorization);
publicAPI.use('/api-auth', jsonContentTypeMiddleware);
publicAPI.route('/api-auth/api-key/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicApiKeyAuthorization);
publicAPI.route('/api-auth/basic/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicBasicAuthorization);
publicAPI.use('/app-store-auth', jsonContentTypeMiddleware);
publicAPI.route('/app-store-auth/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicAppStoreAuthorization);
publicAPI.use('/auth', jsonContentTypeMiddleware);
publicAPI.route('/auth/tba/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicTbaAuthorization);
publicAPI.route('/auth/two-step/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicTwoStepAuthorization);
publicAPI.route('/auth/jwt/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicJwtAuthorization);
publicAPI.route('/auth/bill/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicBillAuthorization);
publicAPI.route('/auth/aws-sigv4/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicAwsSigV4Authorization);
publicAPI.route('/auth/signature/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicSignatureAuthorization);
publicAPI.route('/auth/unauthenticated/:providerConfigKey').post(connectSessionOrPublicAuth, postPublicUnauthenticated);

publicAPI.route('/webhook/:environmentUuid/:providerConfigKey').post(webhookIngressRateLimit, postWebhook);

publicAPI.use('/providers', jsonContentTypeMiddleware);
publicAPI.route('/providers').get(connectSessionOrApiAuth, acceptLanguageMiddleware, getPublicProviders);
publicAPI.route('/providers/:provider').get(connectSessionOrApiAuth, acceptLanguageMiddleware, getPublicProvider);
publicAPI.route('/providers/:provider/templates').get(apiAuth, getPublicProviderTemplates);

// @deprecated rollbacked for one customer, to delete asap
publicAPI
    .route('/config/:providerConfigKey')
    .get(
        apiAuth,
        withAnyScope('environment:integrations:read', 'environment:integrations:read_credentials'),
        configController.getProviderConfig.bind(configController)
    );

// Integrations
publicAPI.use('/integrations', jsonContentTypeMiddleware);
publicAPI
    .route('/integrations')
    .get(connectSessionOrApiAuth, withAnyScope('environment:integrations:list', 'environment:integrations:list_credentials'), getPublicListIntegrations);
publicAPI.route('/integrations').post(apiAuth, withScope('environment:integrations:create'), postPublicIntegration);
publicAPI.route('/integrations/quickstart').post(apiAuth, withScope('environment:integrations:create'), postPublicQuickstartIntegration);
publicAPI.route('/integrations/:uniqueKey').patch(apiAuth, withScope('environment:integrations:update'), patchPublicIntegration);
publicAPI
    .route('/integrations/:uniqueKey')
    .get(apiAuth, withAnyScope('environment:integrations:read', 'environment:integrations:read_credentials'), getPublicIntegration);

publicAPI.route('/integrations/:uniqueKey').delete(apiAuth, withScope('environment:integrations:delete'), deletePublicIntegration);
publicAPI.route('/integrations/:uniqueKey/functions/:name/code').get(apiAuth, withScope('environment:functions:read'), getFunctionCode);
publicAPI.route('/integrations/:uniqueKey/functions').get(apiAuth, withScope('environment:functions:list'), getPublicIntegrationFunctions);
publicAPI
    .route('/integrations/:uniqueKey/functions/:name')
    .get(apiAuth, withScope('environment:functions:read'), getPublicIntegrationFunction)
    .delete(apiAuth, withScope('environment:functions:delete'), deletePublicIntegrationFunction);

// @deprecated connections
publicAPI.use('/connection', jsonContentTypeMiddleware);
// @deprecated
publicAPI
    .route('/connection/:connectionId')
    .get(apiAuth, withAnyScope('environment:connections:read', 'environment:connections:read_credentials'), getPublicConnection);
// @deprecated
publicAPI.route('/connection').get(apiAuth, withAnyScope('environment:connections:list', 'environment:connections:list_credentials'), getPublicConnections);
// @deprecated
publicAPI.route('/connection/:connectionId').delete(apiAuth, auditConnectionDeleted, withScope('environment:connections:delete'), deletePublicConnection);
// @deprecated
publicAPI
    .route('/connection/:connectionId/metadata')
    .post(apiAuth, withScope('environment:connections:update'), connectionController.setMetadataLegacy.bind(connectionController));
// @deprecated
publicAPI
    .route('/connection/:connectionId/metadata')
    .patch(apiAuth, withScope('environment:connections:update'), connectionController.updateMetadataLegacy.bind(connectionController));
// @deprecated
publicAPI.route('/connection/metadata').post(apiAuth, withScope('environment:connections:update'), postPublicMetadata);
// @deprecated
publicAPI.route('/connection/metadata').patch(apiAuth, withScope('environment:connections:update'), patchPublicMetadata);
// @deprecated
publicAPI.route('/connection').post(apiAuth, withScope('environment:connections:create'), connectionController.createConnection.bind(connectionController));

// Connections
publicAPI.use('/connections', jsonContentTypeMiddleware);
publicAPI.route('/connections').post(apiAuth, withScope('environment:connections:create'), postPublicConnection);
publicAPI.route('/connections').get(apiAuth, withAnyScope('environment:connections:list', 'environment:connections:list_credentials'), getPublicConnections);
publicAPI.route('/connections/metadata').post(apiAuth, withScope('environment:connections:update'), postPublicMetadata);
publicAPI.route('/connections/metadata').patch(apiAuth, withScope('environment:connections:update'), patchPublicMetadata);
publicAPI
    .route('/connections/:connectionId')
    .get(apiAuth, withAnyScope('environment:connections:read', 'environment:connections:read_credentials'), getPublicConnection);
publicAPI.route('/connections/:connectionId').patch(apiAuth, withScope('environment:connections:update'), patchPublicConnection);
publicAPI.route('/connections/:connectionId').delete(apiAuth, auditConnectionDeleted, withScope('environment:connections:delete'), deletePublicConnection);

// Config
publicAPI.use('/environment-variables', jsonContentTypeMiddleware);
publicAPI.route('/environment-variables').get(apiAuth, withScope('environment:variables:read'), getPublicEnvironmentVariables);

// Deploy
publicAPI.use('/sync', jsonContentTypeMiddleware);
publicAPI.route('/sync/deploy').post(apiAuth, withScope('environment:deploy'), cliMinVersion('0.39.25'), postDeploy);
publicAPI.route('/sync/deploy/confirmation').post(apiAuth, withScope('environment:deploy'), cliMinVersion('0.39.25'), postDeployConfirmation);
publicAPI.route('/sync/deploy/internal').post(apiAuth, withScope('environment:deploy'), postDeployInternal);

// Syncs
publicAPI.route('/sync/update-connection-frequency').put(apiAuth, withScope('environment:syncs:update'), putSyncConnectionFrequency);

// Records
publicAPI.use('/records', jsonContentTypeMiddleware);
publicAPI.route('/records').get(apiAuth, withScope('environment:records:read'), getPublicRecords);
publicAPI.route('/records/prune').patch(apiAuth, withScope('environment:records:write'), patchPublicPruneRecords);

// Syncs (continued)
publicAPI.use('/sync', jsonContentTypeMiddleware);
publicAPI.route('/sync/trigger').post(apiAuth, withScope('environment:syncs:execute'), postPublicTrigger);
publicAPI.route('/sync/pause').post(apiAuth, withScope('environment:syncs:execute'), postPublicSyncPause);
publicAPI.route('/sync/start').post(apiAuth, withScope('environment:syncs:execute'), postPublicSyncStart);
publicAPI.route('/sync/status').get(apiAuth, withScope('environment:syncs:read'), getPublicSyncStatus);
publicAPI.route('/sync/:name/variant/:variant').post(apiAuth, withScope('environment:syncs:variant:create'), postSyncVariant);
publicAPI.route('/sync/:name/variant/:variant').delete(apiAuth, withScope('environment:syncs:variant:delete'), deleteSyncVariant);

// MCP
publicAPI.use('/mcp', jsonContentTypeMiddleware);
publicAPI.route('/mcp').post(apiAuth, withScope('environment:mcp'), postConnectionToolsMcp);
publicAPI.route('/mcp').get(apiAuth, withScope('environment:mcp'), getConnectionToolsMcp);

// Scripts config
publicAPI.use('/scripts', jsonContentTypeMiddleware);
publicAPI.route('/scripts/config').get(apiAuth, withScope('environment:integrations:list_functions'), getPublicScriptsConfig);

// Functions
publicAPI.use('/functions', jsonContentTypeMiddleware);
publicAPI.route('/functions/compile').post(functionCompileAuth, postFunctionCompile);
publicAPI.route('/functions/dryruns').post(functionDryrunAuth, postFunctionDryrun);
publicAPI.route('/functions/dryruns/:id').get(functionDryrunAuth, getFunctionDryrun);
publicAPI.route('/functions/dryruns/:id/result').post(functionDryrunResultAuth, postFunctionDryrunResult);
publicAPI.route('/functions/deployments').post(functionDeployAuth, postFunctionDeployment);
publicAPI.route('/functions/deployments/:id').get(functionDeployAuth, getFunctionDeployment);
publicAPI.route('/functions/deployments/:id/result').post(functionDeploymentResultAuth, postFunctionDeploymentResult);

// Actions
publicAPI.use('/action', jsonContentTypeMiddleware);
publicAPI.route('/action/trigger').post(apiAuth, withScope('environment:actions:execute'), postPublicTriggerAction); //TODO: to deprecate
publicAPI.route('/action/:id').get(apiAuth, withScope('environment:actions:execute'), getAsyncActionResult);

// Connect sessions
publicAPI.use('/connect', jsonContentTypeMiddleware);
publicAPI.route('/connect/sessions').post(apiAuth, withScope('environment:connect_sessions:write'), connectionCapping, postConnectSessions);
publicAPI.route('/connect/sessions/reconnect').post(apiAuth, withScope('environment:connect_sessions:write'), postConnectSessionsReconnect);
publicAPI.route('/connect/session').get(connectSessionAuth, getConnectSession);
publicAPI.route('/connect/session').delete(connectSessionAuth, deleteConnectSession);
publicAPI.route('/connect/telemetry').post(connectSessionAuthBody, postConnectTelemetry);

// V1 passthrough (deprecated) — scope checks are inline in allPublicV1 after action/model resolution
publicAPI.use('/v1', jsonContentTypeMiddleware);
publicAPI.route('/v1/*splat').all(apiAuth, allPublicV1);

// Proxy
publicAPI.route('/proxy{/*splat}').all(apiAuth, withScope('environment:proxy'), upload.any(), allPublicProxy);
