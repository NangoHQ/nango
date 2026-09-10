import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import multer from 'multer';

import { connectUrl, flagEnforceCLIVersion, metrics } from '@nangohq/utils';

import { can, resolveEnvironment } from './authz/middleware.js';
import { getAsyncActionResult } from './controllers/action/getAsyncActionResult.js';
import { postPublicTriggerAction } from './controllers/action/postTriggerAction.js';
import { deleteAgentSession } from './controllers/agent/deleteSession.js';
import { getAgentSessionMcp, postAgentSessionMcp } from './controllers/agent/mcp/sessionMcp.js';
import { postAgentSessions } from './controllers/agent/postSessions.js';
import appAuthController from './controllers/appAuth.controller.js';
import { postPublicApiKeyAuthorization } from './controllers/auth/postApiKey.js';
import { postPublicAwsSigV4Authorization } from './controllers/auth/postAwsSigV4.js';
import { postPublicBasicAuthorization } from './controllers/auth/postBasic.js';
import { postPublicBillAuthorization } from './controllers/auth/postBill.js';
import { postPublicJwtAuthorization } from './controllers/auth/postJwt.js';
import { postPublicOauthOutboundAuthorization } from './controllers/auth/postOauthOutbound.js';
import { postPublicSignatureAuthorization } from './controllers/auth/postSignature.js';
import { postPublicTbaAuthorization } from './controllers/auth/postTba.js';
import { postPublicTwoStepAuthorization } from './controllers/auth/postTwoStep.js';
import { postPublicUnauthenticated } from './controllers/auth/postUnauthenticated.js';
import { postCliTelemetry } from './controllers/cli/postTelemetry.js';
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
import { deletePublicEnvironmentApiKey } from './controllers/environment/deleteApiKey.js';
import { deletePublicEnvironment } from './controllers/environment/deleteEnvironment.js';
import { getPublicEnvironmentApiKey } from './controllers/environment/getApiKey.js';
import { getPublicEnvironmentApiKeys } from './controllers/environment/getApiKeys.js';
import { getPublicEnvironments } from './controllers/environment/getEnvironments.js';
import { getPublicEnvironmentVariables } from './controllers/environment/getVariables.js';
import { postPublicEnvironmentApiKey } from './controllers/environment/postApiKey.js';
import { postPublicEnvironment } from './controllers/environment/postEnvironment.js';
import { postPublicRotateWebhookSigningKey } from './controllers/environment/postPublicRotateWebhookSigningKey.js';
import { postFunctionCompile } from './controllers/functions/compile/postCompile.js';
import { postFunctionDeploymentBundle } from './controllers/functions/deployments/bundle/postBundle.js';
import { postFunctionDeploymentBundlePreview } from './controllers/functions/deployments/bundle/postPreview.js';
import { getFunctionDeployment } from './controllers/functions/deployments/getDeployment.js';
import { postFunctionDeployment } from './controllers/functions/deployments/postDeployment.js';
import { postFunctionDeploymentResult } from './controllers/functions/deployments/postDeploymentResult.js';
import { getFunctionDryrun } from './controllers/functions/dryrun/getDryrun.js';
import { postFunctionDryrun } from './controllers/functions/dryrun/postDryrun.js';
import { postFunctionDryrunResult } from './controllers/functions/dryrun/postDryrunResult.js';
import { getFunctionInvocation } from './controllers/functions/getInvocation.js';
import { postFunctionInvocation } from './controllers/functions/postInvocation.js';
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
import {
    auditConnectionCreated,
    auditFunctionDeployedCli,
    auditFunctionDeployedFromTemplate,
    auditFunctionDeploymentBundle,
    auditPublicApiKeyCreated,
    auditPublicApiKeyDeleted,
    auditPublicConnectionDeleted,
    auditPublicConnectionUpdated,
    auditPublicEnvironmentCreated,
    auditPublicEnvironmentDeleted,
    auditPublicFunctionDeleted,
    auditPublicIntegrationCreated,
    auditPublicIntegrationDeleted,
    auditPublicIntegrationUpdated,
    auditPublicQuickstartIntegrationCreated,
    auditPublicSyncFrequencyChanged,
    auditPublicWebhookSigningKeyRotated,
    auditSyncPaused,
    auditSyncStarted,
    auditSyncVariantCreated,
    auditSyncVariantDeleted
} from './middleware/audit/index.js';
import { cliMaxVersion, cliMinVersion } from './middleware/cliVersionCheck.js';
import { egressMeterMiddleware } from './middleware/egress-meter.middleware.js';
import { jsonContentTypeMiddleware } from './middleware/json.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { withEnvironmentTarget } from './middleware/scope.middleware.js';
import { webhookIngressRateLimit } from './middleware/webhook-ingress-ratelimit.middleware.js';
import { isBinaryContentType } from './utils/utils.js';

import type { RequestLocals } from './utils/express.js';
import type { Request, RequestHandler } from 'express';

const apiAuth: RequestHandler[] = [authMiddleware.secretKeyAuth.bind(authMiddleware), rateLimiterMiddleware, egressMeterMiddleware];
const envAuth: RequestHandler[] = [...apiAuth, resolveEnvironment];
const connectSessionAuth: RequestHandler[] = [authMiddleware.connectSessionAuth.bind(authMiddleware), rateLimiterMiddleware, egressMeterMiddleware];
const agentSessionAuth: RequestHandler[] = [authMiddleware.agentSessionAuth.bind(authMiddleware), rateLimiterMiddleware, egressMeterMiddleware];
const connectSessionAuthBody: RequestHandler[] = [authMiddleware.connectSessionAuthBody.bind(authMiddleware), rateLimiterMiddleware, egressMeterMiddleware];
const connectSessionOrApiAuth: RequestHandler[] = [
    authMiddleware.connectSessionOrSecretKeyAuth.bind(authMiddleware),
    rateLimiterMiddleware,
    egressMeterMiddleware
];
const connectSessionOrEnvAuth: RequestHandler[] = [...connectSessionOrApiAuth, resolveEnvironment];
const connectSessionOrPublicAuth: RequestHandler[] = [
    authMiddleware.connectSessionOrPublicKeyAuth.bind(authMiddleware),
    rateLimiterMiddleware,
    egressMeterMiddleware
];

const functionCompileAuth: RequestHandler[] = [...envAuth, can('environment:functions:compile')];
const functionDryrunAuth: RequestHandler[] = [...envAuth, can('environment:functions:dryrun')];
const sandboxTokenOnly: RequestHandler = (_req, res, next) => {
    if (res.locals['apiKeyAuthSource'] !== 'sandbox_token') {
        res.status(403).send({ error: { code: 'forbidden', message: 'This endpoint only accepts sandbox tokens' } });
        return;
    }

    next();
};

function trackDeprecatedPublicEndpoint(endpoint: string, isInternal?: (req: Request) => boolean): RequestHandler {
    return (req, res, next) => {
        const { account, environment } = res.locals as RequestLocals;
        if (environment) {
            metrics.increment(metrics.Types.DEPRECATED_PUBLIC_ENDPOINT_USED, 1, {
                accountId: account.id,
                environmentId: environment.id,
                endpoint,
                ...(isInternal && { internal: isInternal(req) ? 'true' : 'false' })
            });
        }
        next();
    };
}
const functionDryrunResultAuth: RequestHandler[] = [...envAuth, withEnvironmentTarget, sandboxTokenOnly];
const functionDeployAuth: RequestHandler[] = [...envAuth, can('environment:deploy')];
const functionDeploymentResultAuth: RequestHandler[] = [...envAuth, withEnvironmentTarget, sandboxTokenOnly];

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
publicAPI.use(
    express.urlencoded({
        extended: true,
        limit: bodyLimit,
        // Slack signs the raw form body, so webhook routing needs it as sent.
        verify: (req: Request, _, buf) => {
            req.rawBody = buf.toString();
        }
    })
);

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
    origin: new URL(connectUrl).origin
});
publicAPI.options('/connect/telemetry', publicAPITelemetryCors);
publicAPI.use('/', publicAPICorsHandler);
publicAPI.options('/', publicAPICorsHandler); // Pre-flight
publicAPI.use('/connect/telemetry', publicAPITelemetryCors);

// API routes (Public key auth).
publicAPI.route('/oauth/callback').get(cookieParser(), auditConnectionCreated, oauthController.oauthCallback.bind(oauthController));
publicAPI.route('/oauth/client-metadata/:environmentUuid/:providerConfigKey').get(getClientMetadata);
publicAPI.route('/app-auth/connect').get(auditConnectionCreated, appAuthController.connect.bind(appAuthController));

publicAPI.use('/oauth', jsonContentTypeMiddleware);
publicAPI.route('/oauth/connect/:providerConfigKey').get(connectSessionOrPublicAuth, oauthController.oauthRequest.bind(oauthController));
publicAPI
    .route('/oauth2/auth/:providerConfigKey')
    .post(connectSessionOrPublicAuth, auditConnectionCreated, oauthController.oauth2RequestCC.bind(oauthController));
publicAPI.route('/auth/oauth-outbound/:providerConfigKey').post(connectSessionOrPublicAuth, auditConnectionCreated, postPublicOauthOutboundAuthorization);
publicAPI.use('/api-auth', jsonContentTypeMiddleware);
publicAPI.route('/api-auth/api-key/:providerConfigKey').post(connectSessionOrPublicAuth, auditConnectionCreated, postPublicApiKeyAuthorization);
publicAPI.route('/api-auth/basic/:providerConfigKey').post(connectSessionOrPublicAuth, auditConnectionCreated, postPublicBasicAuthorization);
publicAPI.use('/auth', jsonContentTypeMiddleware);
publicAPI.route('/auth/tba/:providerConfigKey').post(connectSessionOrPublicAuth, auditConnectionCreated, postPublicTbaAuthorization);
publicAPI.route('/auth/two-step/:providerConfigKey').post(connectSessionOrPublicAuth, auditConnectionCreated, postPublicTwoStepAuthorization);
publicAPI.route('/auth/jwt/:providerConfigKey').post(connectSessionOrPublicAuth, auditConnectionCreated, postPublicJwtAuthorization);
publicAPI.route('/auth/bill/:providerConfigKey').post(connectSessionOrPublicAuth, auditConnectionCreated, postPublicBillAuthorization);
publicAPI.route('/auth/aws-sigv4/:providerConfigKey').post(connectSessionOrPublicAuth, auditConnectionCreated, postPublicAwsSigV4Authorization);
publicAPI.route('/auth/signature/:providerConfigKey').post(connectSessionOrPublicAuth, auditConnectionCreated, postPublicSignatureAuthorization);
publicAPI.route('/auth/unauthenticated/:providerConfigKey').post(connectSessionOrPublicAuth, auditConnectionCreated, postPublicUnauthenticated);

publicAPI.route('/webhook/:environmentUuid/:providerConfigKey').post(webhookIngressRateLimit, postWebhook);

publicAPI.use('/providers', jsonContentTypeMiddleware);
publicAPI.route('/providers').get(connectSessionOrEnvAuth, withEnvironmentTarget, acceptLanguageMiddleware, getPublicProviders);
publicAPI.route('/providers/:provider').get(connectSessionOrEnvAuth, withEnvironmentTarget, acceptLanguageMiddleware, getPublicProvider);
publicAPI.route('/providers/:provider/templates').get(envAuth, withEnvironmentTarget, getPublicProviderTemplates);

publicAPI.use('/environments', jsonContentTypeMiddleware);
publicAPI.route('/environments').get(apiAuth, can('account:environments:list'), getPublicEnvironments);
publicAPI.route('/environments').post(apiAuth, auditPublicEnvironmentCreated, can('account:environments:create'), postPublicEnvironment);
publicAPI.route('/environments/:environmentUuid').delete(apiAuth, auditPublicEnvironmentDeleted, can('account:environments:delete'), deletePublicEnvironment);
publicAPI
    .route('/environments/:environmentUuid/api-keys')
    .get(apiAuth, can('account:environments:api_keys:list'), getPublicEnvironmentApiKeys)
    .post(apiAuth, auditPublicApiKeyCreated, can('account:environments:api_keys:create'), postPublicEnvironmentApiKey);
publicAPI
    .route('/environments/:environmentUuid/api-keys/:keyUuid')
    .get(apiAuth, can('account:environments:api_keys:read'), getPublicEnvironmentApiKey)
    .delete(apiAuth, auditPublicApiKeyDeleted, can('account:environments:api_keys:delete'), deletePublicEnvironmentApiKey);

// @deprecated rollbacked for one customer, to delete asap
publicAPI
    .route('/config/:providerConfigKey')
    .get(
        envAuth,
        can('environment:integrations:read', 'environment:integrations:read_credentials'),
        trackDeprecatedPublicEndpoint('GET /config/:providerConfigKey'),
        configController.getProviderConfig.bind(configController)
    );

// Integrations
publicAPI.use('/integrations', jsonContentTypeMiddleware);
publicAPI
    .route('/integrations')
    .get(connectSessionOrEnvAuth, can('environment:integrations:list', 'environment:integrations:list_credentials'), getPublicListIntegrations);
publicAPI.route('/integrations').post(envAuth, auditPublicIntegrationCreated, can('environment:integrations:create'), postPublicIntegration);
publicAPI
    .route('/integrations/quickstart')
    .post(envAuth, auditPublicQuickstartIntegrationCreated, can('environment:integrations:create'), postPublicQuickstartIntegration);
publicAPI.route('/integrations/:uniqueKey').patch(envAuth, auditPublicIntegrationUpdated, can('environment:integrations:update'), patchPublicIntegration);
publicAPI
    .route('/integrations/:uniqueKey')
    .get(envAuth, can('environment:integrations:read', 'environment:integrations:read_credentials'), getPublicIntegration);

publicAPI.route('/integrations/:uniqueKey').delete(envAuth, auditPublicIntegrationDeleted, can('environment:integrations:delete'), deletePublicIntegration);
publicAPI.route('/integrations/:uniqueKey/functions/:name/code').get(envAuth, can('environment:functions:read'), getFunctionCode);
publicAPI.route('/integrations/:uniqueKey/functions').get(envAuth, can('environment:functions:list'), getPublicIntegrationFunctions);
publicAPI
    .route('/integrations/:uniqueKey/functions/:name')
    .get(envAuth, can('environment:functions:read'), getPublicIntegrationFunction)
    .delete(envAuth, auditPublicFunctionDeleted, can('environment:functions:delete'), deletePublicIntegrationFunction);

// @deprecated connections
publicAPI.use('/connection', jsonContentTypeMiddleware);
// @deprecated
publicAPI.route('/connection/:connectionId').get(
    envAuth,
    can('environment:connections:read', 'environment:connections:read_credentials'),
    trackDeprecatedPublicEndpoint('GET /connection/:connectionId', (req) => req.get('Nango-Is-Sync') === 'true'),
    getPublicConnection
);
// @deprecated
publicAPI
    .route('/connection')
    .get(
        envAuth,
        can('environment:connections:list', 'environment:connections:list_credentials'),
        trackDeprecatedPublicEndpoint('GET /connection'),
        getPublicConnections
    );
// @deprecated
publicAPI
    .route('/connection/:connectionId')
    .delete(
        envAuth,
        auditPublicConnectionDeleted,
        can('environment:connections:delete'),
        trackDeprecatedPublicEndpoint('DELETE /connection/:connectionId'),
        deletePublicConnection
    );
// @deprecated
publicAPI
    .route('/connection/:connectionId/metadata')
    .post(
        envAuth,
        can('environment:connections:update'),
        trackDeprecatedPublicEndpoint('POST /connection/:connectionId/metadata'),
        connectionController.setMetadataLegacy.bind(connectionController)
    );
// @deprecated
publicAPI
    .route('/connection/:connectionId/metadata')
    .patch(
        envAuth,
        can('environment:connections:update'),
        trackDeprecatedPublicEndpoint('PATCH /connection/:connectionId/metadata'),
        connectionController.updateMetadataLegacy.bind(connectionController)
    );
// @deprecated
publicAPI
    .route('/connection/metadata')
    .post(envAuth, can('environment:connections:update'), trackDeprecatedPublicEndpoint('POST /connection/metadata'), postPublicMetadata);
// @deprecated
publicAPI
    .route('/connection/metadata')
    .patch(envAuth, can('environment:connections:update'), trackDeprecatedPublicEndpoint('PATCH /connection/metadata'), patchPublicMetadata);
// @deprecated
publicAPI
    .route('/connection')
    .post(
        envAuth,
        auditConnectionCreated,
        can('environment:connections:create'),
        trackDeprecatedPublicEndpoint('POST /connection'),
        connectionController.createConnection.bind(connectionController)
    );

// Connections
publicAPI.use('/connections', jsonContentTypeMiddleware);
publicAPI.route('/connections').post(envAuth, auditConnectionCreated, can('environment:connections:create'), postPublicConnection);
publicAPI.route('/connections').get(envAuth, can('environment:connections:list', 'environment:connections:list_credentials'), getPublicConnections);
publicAPI.route('/connections/metadata').post(envAuth, can('environment:connections:update'), postPublicMetadata);
publicAPI.route('/connections/metadata').patch(envAuth, can('environment:connections:update'), patchPublicMetadata);
publicAPI
    .route('/connections/:connectionId')
    .get(envAuth, can('environment:connections:read', 'environment:connections:read_credentials'), getPublicConnection);
publicAPI.route('/connections/:connectionId').patch(envAuth, auditPublicConnectionUpdated, can('environment:connections:update'), patchPublicConnection);
publicAPI.route('/connections/:connectionId').delete(envAuth, auditPublicConnectionDeleted, can('environment:connections:delete'), deletePublicConnection);

// Config
publicAPI.use('/environment-variables', jsonContentTypeMiddleware);
publicAPI.route('/environment-variables').get(envAuth, can('environment:variables:read'), getPublicEnvironmentVariables);

publicAPI.use('/environment', jsonContentTypeMiddleware);
publicAPI
    .route('/environment/webhook-signing-key/rotate')
    .post(envAuth, auditPublicWebhookSigningKeyRotated, can('environment:webhook_signing_key:rotate'), postPublicRotateWebhookSigningKey);

// Deploy
publicAPI.use('/sync', jsonContentTypeMiddleware);
publicAPI.route('/sync/deploy').post(envAuth, auditFunctionDeployedCli, can('environment:deploy'), cliMinVersion('0.39.25'), postDeploy);
publicAPI.route('/sync/deploy/confirmation').post(envAuth, can('environment:deploy'), cliMinVersion('0.39.25'), postDeployConfirmation);
publicAPI.route('/sync/deploy/internal').post(envAuth, can('environment:deploy'), postDeployInternal);

// CLI
publicAPI.use('/cli', jsonContentTypeMiddleware);
publicAPI.route('/cli/telemetry').post(rateLimiterMiddleware, postCliTelemetry);

// Syncs
publicAPI.route('/sync/update-connection-frequency').put(envAuth, auditPublicSyncFrequencyChanged, can('environment:syncs:update'), putSyncConnectionFrequency);

// Records
publicAPI.use('/records', jsonContentTypeMiddleware);
publicAPI.route('/records').get(envAuth, can('environment:records:read'), getPublicRecords);
publicAPI.route('/records/prune').patch(envAuth, can('environment:records:write'), patchPublicPruneRecords);

// Syncs (continued)
publicAPI.use('/sync', jsonContentTypeMiddleware);
publicAPI.route('/sync/trigger').post(envAuth, can('environment:syncs:execute'), postPublicTrigger);
publicAPI.route('/sync/pause').post(envAuth, auditSyncPaused, can('environment:syncs:execute'), postPublicSyncPause);
publicAPI.route('/sync/start').post(envAuth, auditSyncStarted, can('environment:syncs:execute'), postPublicSyncStart);
publicAPI.route('/sync/status').get(envAuth, can('environment:syncs:read'), getPublicSyncStatus);
publicAPI.route('/sync/:name/variant/:variant').post(envAuth, auditSyncVariantCreated, can('environment:syncs:variant:create'), postSyncVariant);
publicAPI.route('/sync/:name/variant/:variant').delete(envAuth, auditSyncVariantDeleted, can('environment:syncs:variant:delete'), deleteSyncVariant);

// MCP
publicAPI.use('/mcp', jsonContentTypeMiddleware);
publicAPI.route('/mcp').post(envAuth, can('environment:mcp'), postConnectionToolsMcp);
publicAPI.route('/mcp').get(envAuth, can('environment:mcp'), getConnectionToolsMcp);

// Scripts config
publicAPI.use('/scripts', jsonContentTypeMiddleware);
publicAPI.route('/scripts/config').get(envAuth, can('environment:integrations:list_functions'), getPublicScriptsConfig);

// Functions
publicAPI.use('/functions', jsonContentTypeMiddleware);

publicAPI.route('/functions/compile').post(functionCompileAuth, postFunctionCompile);
publicAPI.route('/functions/dryruns').post(functionDryrunAuth, postFunctionDryrun);
publicAPI.route('/functions/dryruns/:id').get(functionDryrunAuth, getFunctionDryrun);
publicAPI.route('/functions/dryruns/:id/result').post(functionDryrunResultAuth, postFunctionDryrunResult);
publicAPI.route('/functions/deployments').post(envAuth, auditFunctionDeployedFromTemplate, can('environment:deploy'), postFunctionDeployment);
publicAPI.route('/functions/deployments/:id').get(functionDeployAuth, getFunctionDeployment);
publicAPI.route('/functions/deployments/:id/result').post(functionDeploymentResultAuth, postFunctionDeploymentResult);

publicAPI.route('/functions/deployments/bundle/preview').post(envAuth, can('environment:deploy'), postFunctionDeploymentBundlePreview);
publicAPI.route('/functions/deployments/bundle').post(envAuth, auditFunctionDeploymentBundle, can('environment:deploy'), postFunctionDeploymentBundle);

publicAPI.route('/functions/invocations').post(envAuth, can('environment:functions:invocations'), postFunctionInvocation);
publicAPI.route('/functions/invocations/:id').get(envAuth, can('environment:functions:invocations'), getFunctionInvocation);

// Actions
publicAPI.use('/action', jsonContentTypeMiddleware);
publicAPI.route('/action/trigger').post(envAuth, can('environment:actions:execute'), postPublicTriggerAction); //TODO: to deprecate
publicAPI.route('/action/:id').get(envAuth, can('environment:actions:execute'), getAsyncActionResult);

// Connect sessions
publicAPI.use('/connect', jsonContentTypeMiddleware);
publicAPI.route('/connect/sessions').post(envAuth, can('environment:connect_sessions:write'), postConnectSessions);
publicAPI.route('/connect/sessions/reconnect').post(envAuth, can('environment:connect_sessions:write'), postConnectSessionsReconnect);
publicAPI.route('/connect/session').get(connectSessionAuth, getConnectSession);
publicAPI.route('/connect/session').delete(connectSessionAuth, deleteConnectSession);
publicAPI.route('/connect/telemetry').post(connectSessionAuthBody, postConnectTelemetry);

// Agent sessions
publicAPI.use('/sessions', jsonContentTypeMiddleware);
publicAPI.route('/sessions').post(envAuth, can('environment:agent_sessions:write'), postAgentSessions);
publicAPI.route('/sessions/:sessionId').delete(envAuth, can('environment:agent_sessions:write'), deleteAgentSession);
publicAPI.use('/session/:sessionId/mcp', jsonContentTypeMiddleware);
publicAPI.route('/session/:sessionId/mcp').post(agentSessionAuth, postAgentSessionMcp);
publicAPI.route('/session/:sessionId/mcp').get(agentSessionAuth, getAgentSessionMcp);

// V1 passthrough (deprecated) — scope checks are inline in allPublicV1 after action/model resolution
publicAPI.use('/v1', jsonContentTypeMiddleware);
publicAPI.route('/v1/*splat').all(envAuth, withEnvironmentTarget, allPublicV1);

// Proxy
publicAPI.route('/proxy{/*splat}').all(envAuth, can('environment:proxy'), upload.any(), allPublicProxy);
