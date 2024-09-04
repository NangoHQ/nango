import bodyParser from 'body-parser';
import multer from 'multer';
import oauthController from './controllers/oauth.controller.js';
import configController from './controllers/config.controller.js';
import providerController from './controllers/provider.controller.js';
import connectionController from './controllers/connection.controller.js';
import authController from './controllers/auth.controller.js';
import unAuthController from './controllers/unauth.controller.js';
import appStoreAuthController from './controllers/appStoreAuth.controller.js';
import authMiddleware from './middleware/access.middleware.js';
import userController from './controllers/user.controller.js';
import proxyController from './controllers/proxy.controller.js';
import syncController from './controllers/sync.controller.js';
import flowController from './controllers/flow.controller.js';
import apiAuthController from './controllers/apiAuth.controller.js';
import appAuthController from './controllers/appAuth.controller.js';
import onboardingController from './controllers/onboarding.controller.js';
import webhookController from './controllers/webhook.controller.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { authCheck } from './middleware/resource-capping.middleware.js';
import path from 'path';
import { dirname } from './utils/utils.js';
import express from 'express';
import cors from 'cors';
import { setupAuth } from './clients/auth.client.js';
import passport from 'passport';
import environmentController from './controllers/environment.controller.js';
import accountController from './controllers/account.controller.js';
import type { Response, Request } from 'express';
import { isCloud, isEnterprise, isBasicAuthEnabled, isTest, isLocal, basePublicUrl, baseUrl, flagHasAuth, flagHasManagedAuth } from '@nangohq/utils';
import { errorManager } from '@nangohq/shared';
import tracer from 'dd-trace';
import { getConnection as getConnectionWeb } from './controllers/v1/connection/get.js';
import { searchOperations } from './controllers/v1/logs/searchOperations.js';
import { getOperation } from './controllers/v1/logs/getOperation.js';
import { patchSettings } from './controllers/v1/environment/webhook/patchSettings.js';
import { updatePrimaryUrl } from './controllers/v1/environment/webhook/updatePrimaryUrl.js';
import { updateSecondaryUrl } from './controllers/v1/environment/webhook/updateSecondaryUrl.js';
import {
    getEmailByUuid,
    resendVerificationEmailByUuid,
    resendVerificationEmailByEmail,
    signup,
    signin,
    validateEmailAndLogin,
    getEmailByExpiredToken
} from './controllers/v1/account/index.js';
import { searchMessages } from './controllers/v1/logs/searchMessages.js';
import type { ApiError } from '@nangohq/types';
import { searchFilters } from './controllers/v1/logs/searchFilters.js';
import { postDeployConfirmation } from './controllers/sync/deploy/postConfirmation.js';
import { postDeploy } from './controllers/sync/deploy/postDeploy.js';
import { postDeployInternal } from './controllers/sync/deploy/postDeployInternal.js';
import { tbaAuthorization } from './controllers/auth/tba.js';
import { tableauAuthorization } from './controllers/auth/tableau.js';
import { getTeam } from './controllers/v1/team/getTeam.js';
import { putTeam } from './controllers/v1/team/putTeam.js';
import { putResetPassword } from './controllers/v1/account/putResetPassword.js';
import { postForgotPassword } from './controllers/v1/account/postForgotPassword.js';
import { postInvite } from './controllers/v1/invite/postInvite.js';
import { deleteInvite } from './controllers/v1/invite/deleteInvite.js';
import { deleteTeamUser } from './controllers/v1/team/users/deleteTeamUser.js';
import { getUser } from './controllers/v1/user/getUser.js';
import { patchUser } from './controllers/v1/user/patchUser.js';
import { postInsights } from './controllers/v1/logs/postInsights.js';
import { getInvite } from './controllers/v1/invite/getInvite.js';
import { declineInvite } from './controllers/v1/invite/declineInvite.js';
import { acceptInvite } from './controllers/v1/invite/acceptInvite.js';
import { getMeta } from './controllers/v1/meta/getMeta.js';
import { securityMiddlewares } from './middleware/security.js';
import { postManagedSignup } from './controllers/v1/account/managed/postSignup.js';
import { getManagedCallback } from './controllers/v1/account/managed/getCallback.js';
import { getEnvJs } from './controllers/v1/getEnvJs.js';
import { getListIntegrations } from './controllers/config/getListIntegrations.js';
import { getIntegration } from './controllers/v1/integrations/providerConfigKey/getIntegration.js';
import { patchIntegration } from './controllers/v1/integrations/providerConfigKey/patchIntegration.js';
import { deleteIntegration } from './controllers/v1/integrations/providerConfigKey/deleteIntegration.js';
import { deleteIntegrationPublic } from './controllers/config/providerConfigKey/deleteIntegration.js';
import { postIntegration } from './controllers/v1/integrations/postIntegration.js';
import { getIntegrationFlows } from './controllers/v1/integrations/providerConfigKey/flows/getFlows.js';
import { postPreBuiltDeploy } from './controllers/v1/flows/preBuilt/postDeploy.js';
import { putUpgradePreBuilt } from './controllers/v1/flows/preBuilt/putUpgrade.js';
import { patchFlowDisable } from './controllers/v1/flows/id/patchDisable.js';
import { patchFlowEnable } from './controllers/v1/flows/id/patchEnable.js';
import { patchFlowFrequency } from './controllers/v1/flows/id/patchFrequency.js';
import { postPublicMetadata } from './controllers/connection/connectionId/metadata/postMetadata.js';
import { patchPublicMetadata } from './controllers/connection/connectionId/metadata/patchMetadata.js';
import { deletePublicConnection } from './controllers/connection/connectionId/deleteConnection.js';
import { deleteConnection } from './controllers/v1/connection/deleteConnection.js';

export const router = express.Router();

router.use(...securityMiddlewares());

const apiAuth = [authMiddleware.secretKeyAuth.bind(authMiddleware), rateLimiterMiddleware];
const adminAuth = [authMiddleware.secretKeyAuth.bind(authMiddleware), authMiddleware.adminKeyAuth.bind(authMiddleware), rateLimiterMiddleware];
const apiPublicAuth = [authMiddleware.publicKeyAuth.bind(authMiddleware), authCheck, rateLimiterMiddleware];
let webAuth = flagHasAuth
    ? [passport.authenticate('session'), authMiddleware.sessionAuth.bind(authMiddleware), rateLimiterMiddleware]
    : isBasicAuthEnabled
      ? [passport.authenticate('basic', { session: false }), authMiddleware.basicAuth.bind(authMiddleware), rateLimiterMiddleware]
      : [authMiddleware.noAuth.bind(authMiddleware), rateLimiterMiddleware];

// For integration test, we want to bypass session auth
if (isTest) {
    webAuth = apiAuth;
}

router.use(
    express.json({
        limit: '75mb',
        verify: (req: Request, _, buf) => {
            req.rawBody = buf.toString();
        }
    })
);
router.use(bodyParser.raw({ type: 'text/xml' }));
router.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

// -------
// API routes (no/public auth).
router.get('/health', (_, res) => {
    res.status(200).send({ result: 'ok' });
});
router.get('/env.js', getEnvJs);

// -------
// Public API routes
const publicAPI = express.Router();
const publicAPICorsHandler = cors({
    maxAge: 600,
    exposedHeaders: 'Authorization, Etag, Content-Type, Content-Length, X-Nango-Signature, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
    allowedHeaders:
        'Authorization, Content-Type, Accept, Origin, X-Requested-With, Nango-Activity-Log-Id, Nango-Is-Dry-Run, Nango-Is-Sync, Provider-Config-Key, Connection-Id',
    origin: '*'
});
publicAPI.use(publicAPICorsHandler);
publicAPI.options('*', publicAPICorsHandler); // Pre-flight

publicAPI.route('/oauth/callback').get(oauthController.oauthCallback.bind(oauthController));
publicAPI.route('/webhook/:environmentUuid/:providerConfigKey').post(webhookController.receive.bind(proxyController));
publicAPI.route('/app-auth/connect').get(appAuthController.connect.bind(appAuthController));
publicAPI.route('/oauth/connect/:providerConfigKey').get(apiPublicAuth, oauthController.oauthRequest.bind(oauthController));
publicAPI.route('/oauth2/auth/:providerConfigKey').post(apiPublicAuth, oauthController.oauth2RequestCC.bind(oauthController));
publicAPI.route('/api-auth/api-key/:providerConfigKey').post(apiPublicAuth, apiAuthController.apiKey.bind(apiAuthController));
publicAPI.route('/api-auth/basic/:providerConfigKey').post(apiPublicAuth, apiAuthController.basic.bind(apiAuthController));
publicAPI.route('/app-store-auth/:providerConfigKey').post(apiPublicAuth, appStoreAuthController.auth.bind(appStoreAuthController));
publicAPI.route('/auth/tba/:providerConfigKey').post(apiPublicAuth, tbaAuthorization);
publicAPI.route('/auth/tableau/:providerConfigKey').post(apiPublicAuth, tableauAuthorization);
publicAPI.route('/unauth/:providerConfigKey').post(apiPublicAuth, unAuthController.create.bind(unAuthController));

// API Admin routes
publicAPI.route('/admin/flow/deploy/pre-built').post(adminAuth, flowController.adminDeployPrivateFlow.bind(flowController));
publicAPI.route('/admin/customer').patch(adminAuth, accountController.editCustomer.bind(accountController));

// API routes (API key auth).
publicAPI.route('/provider').get(apiAuth, providerController.listProviders.bind(providerController));
publicAPI.route('/provider/:provider').get(apiAuth, providerController.getProvider.bind(providerController));
publicAPI.route('/config').get(apiAuth, getListIntegrations);
publicAPI.route('/config/:providerConfigKey').get(apiAuth, configController.getProviderConfig.bind(configController));
publicAPI.route('/config').post(apiAuth, configController.createProviderConfig.bind(configController));
publicAPI.route('/config').put(apiAuth, configController.editProviderConfig.bind(configController));
publicAPI.route('/config/:providerConfigKey').delete(apiAuth, deleteIntegrationPublic);
publicAPI.route('/connection/:connectionId').get(apiAuth, connectionController.getConnectionCreds.bind(connectionController));
publicAPI.route('/connection').get(apiAuth, connectionController.listConnections.bind(connectionController));
publicAPI.route('/connection/:connectionId').delete(apiAuth, deletePublicConnection);
publicAPI.route('/connection/:connectionId/metadata').post(apiAuth, connectionController.setMetadataLegacy.bind(connectionController));
publicAPI.route('/connection/:connectionId/metadata').patch(apiAuth, connectionController.updateMetadataLegacy.bind(connectionController));
publicAPI.route('/connection/metadata').post(apiAuth, postPublicMetadata);
publicAPI.route('/connection/metadata').patch(apiAuth, patchPublicMetadata);
publicAPI.route('/connection').post(apiAuth, connectionController.createConnection.bind(connectionController));
publicAPI.route('/environment-variables').get(apiAuth, environmentController.getEnvironmentVariables.bind(connectionController));
publicAPI.route('/sync/deploy').post(apiAuth, postDeploy);
publicAPI.route('/sync/deploy/confirmation').post(apiAuth, postDeployConfirmation);
publicAPI.route('/sync/deploy/internal').post(apiAuth, postDeployInternal);
publicAPI.route('/sync/update-connection-frequency').put(apiAuth, syncController.updateFrequencyForConnection.bind(syncController));
publicAPI.route('/records').get(apiAuth, syncController.getAllRecords.bind(syncController));
publicAPI.route('/sync/trigger').post(apiAuth, syncController.trigger.bind(syncController));
publicAPI.route('/sync/pause').post(apiAuth, syncController.pause.bind(syncController));
publicAPI.route('/sync/start').post(apiAuth, syncController.start.bind(syncController));
publicAPI.route('/sync/provider').get(apiAuth, syncController.getSyncProvider.bind(syncController));
publicAPI.route('/sync/status').get(apiAuth, syncController.getSyncStatus.bind(syncController));
publicAPI.route('/sync/:syncId').delete(apiAuth, syncController.deleteSync.bind(syncController));
publicAPI.route('/flow/attributes').get(apiAuth, syncController.getFlowAttributes.bind(syncController));
publicAPI.route('/flow/configs').get(apiAuth, flowController.getFlowConfig.bind(flowController));
publicAPI.route('/scripts/config').get(apiAuth, flowController.getFlowConfig.bind(flowController));
publicAPI.route('/action/trigger').post(apiAuth, syncController.triggerAction.bind(syncController)); //TODO: to deprecate

publicAPI.route('/v1/*').all(apiAuth, syncController.actionOrModel.bind(syncController));

publicAPI.route('/proxy/*').all(apiAuth, upload.any(), proxyController.routeCall.bind(proxyController));

router.use(publicAPI);

// -------
// Webapp routes (session auth).
const web = express.Router();
setupAuth(web);

const webCorsHandler = cors({
    maxAge: 600,
    exposedHeaders: 'Authorization, Etag, Content-Type, Content-Length, Set-Cookie',
    origin: isLocal ? '*' : [basePublicUrl, baseUrl],
    credentials: true
});
web.use(webCorsHandler);
web.options('*', webCorsHandler); // Pre-flight

// Webapp routes (no auth).
if (flagHasAuth) {
    web.route('/api/v1/account/signup').post(rateLimiterMiddleware, signup);
    web.route('/api/v1/account/logout').post(rateLimiterMiddleware, authController.logout.bind(authController));
    web.route('/api/v1/account/signin').post(rateLimiterMiddleware, passport.authenticate('local'), signin);
    web.route('/api/v1/account/forgot-password').post(rateLimiterMiddleware, postForgotPassword);
    web.route('/api/v1/account/reset-password').put(rateLimiterMiddleware, putResetPassword);
    web.route('/api/v1/account/resend-verification-email/by-uuid').post(rateLimiterMiddleware, resendVerificationEmailByUuid);
    web.route('/api/v1/account/resend-verification-email/by-email').post(rateLimiterMiddleware, resendVerificationEmailByEmail);
    web.route('/api/v1/account/email/:uuid').get(rateLimiterMiddleware, getEmailByUuid);
    web.route('/api/v1/account/email/expired-token/:token').get(rateLimiterMiddleware, getEmailByExpiredToken);
    web.route('/api/v1/account/verify/code').post(rateLimiterMiddleware, validateEmailAndLogin);
}

if (flagHasManagedAuth) {
    web.route('/api/v1/account/managed/signup').post(rateLimiterMiddleware, postManagedSignup);
    web.route('/api/v1/account/managed/callback').get(rateLimiterMiddleware, getManagedCallback);
    // TODO: drop this one
    web.route('/api/v1/login/callback').get(rateLimiterMiddleware, getManagedCallback);
}

web.route('/api/v1/meta').get(webAuth, getMeta);
web.route('/api/v1/team').get(webAuth, getTeam);
web.route('/api/v1/team').put(webAuth, putTeam);
web.route('/api/v1/team/users/:id').delete(webAuth, deleteTeamUser);
web.route('/api/v1/invite').post(webAuth, postInvite);
web.route('/api/v1/invite').delete(webAuth, deleteInvite);
web.route('/api/v1/invite/:id').get(rateLimiterMiddleware, getInvite);
web.route('/api/v1/invite/:id').post(webAuth, acceptInvite);
web.route('/api/v1/invite/:id').delete(webAuth, declineInvite);
web.route('/api/v1/account/admin/switch').post(webAuth, accountController.switchAccount.bind(accountController));

web.route('/api/v1/environment').get(webAuth, environmentController.getEnvironment.bind(environmentController));
web.route('/api/v1/environment/callback').post(webAuth, environmentController.updateCallback.bind(environmentController));
web.route('/api/v1/environment/webhook/primary-url').patch(webAuth, updatePrimaryUrl);
web.route('/api/v1/environment/webhook/secondary-url').patch(webAuth, updateSecondaryUrl);
web.route('/api/v1/environment/hmac').get(webAuth, environmentController.getHmacDigest.bind(environmentController));
web.route('/api/v1/environment/hmac-enabled').post(webAuth, environmentController.updateHmacEnabled.bind(environmentController));
web.route('/api/v1/environment/slack-notifications-enabled').post(webAuth, environmentController.updateSlackNotificationsEnabled.bind(environmentController));
web.route('/api/v1/environment/hmac-key').post(webAuth, environmentController.updateHmacKey.bind(environmentController));
web.route('/api/v1/environment/environment-variables').post(webAuth, environmentController.updateEnvironmentVariables.bind(environmentController));
web.route('/api/v1/environment/rotate-key').post(webAuth, environmentController.rotateKey.bind(accountController));
web.route('/api/v1/environment/revert-key').post(webAuth, environmentController.revertKey.bind(accountController));
web.route('/api/v1/environment/webhook/settings').patch(webAuth, patchSettings);
web.route('/api/v1/environment/activate-key').post(webAuth, environmentController.activateKey.bind(accountController));
web.route('/api/v1/environment/admin-auth').get(webAuth, environmentController.getAdminAuthInfo.bind(environmentController));

web.route('/api/v1/integrations').get(webAuth, configController.listProviderConfigsWeb.bind(configController));
web.route('/api/v1/integrations/:providerConfigKey/connections').get(webAuth, configController.getConnections.bind(connectionController));
web.route('/api/v1/integrations').post(webAuth, postIntegration);
web.route('/api/v1/integrations/:providerConfigKey').get(webAuth, getIntegration);
web.route('/api/v1/integrations/:providerConfigKey').patch(webAuth, patchIntegration);
web.route('/api/v1/integrations/:providerConfigKey').delete(webAuth, deleteIntegration);
web.route('/api/v1/integrations/:providerConfigKey/flows').get(webAuth, getIntegrationFlows);

web.route('/api/v1/provider').get(configController.listProvidersFromYaml.bind(configController));

web.route('/api/v1/connection').get(webAuth, connectionController.listConnections.bind(connectionController));
web.route('/api/v1/connection/:connectionId').get(webAuth, getConnectionWeb);
web.route('/api/v1/connection/:connectionId').delete(webAuth, deleteConnection);
web.route('/api/v1/connection/admin/:connectionId').delete(webAuth, connectionController.deleteAdminConnection.bind(connectionController));

web.route('/api/v1/user').get(webAuth, getUser);
web.route('/api/v1/user').patch(webAuth, patchUser);
web.route('/api/v1/user/password').put(webAuth, userController.editPassword.bind(userController));
web.route('/api/v1/users/:userId/suspend').post(webAuth, userController.suspend.bind(userController));

web.route('/api/v1/sync').get(webAuth, syncController.getSyncsByParams.bind(syncController));
web.route('/api/v1/sync/command').post(webAuth, syncController.syncCommand.bind(syncController));
web.route('/api/v1/syncs').get(webAuth, syncController.getSyncs.bind(syncController));
web.route('/api/v1/flows').get(webAuth, flowController.getFlows.bind(syncController));
web.route('/api/v1/flows/pre-built/deploy').post(webAuth, postPreBuiltDeploy);
web.route('/api/v1/flows/pre-built/upgrade').put(webAuth, putUpgradePreBuilt);
web.route('/api/v1/flow/download').post(webAuth, flowController.downloadFlow.bind(flowController));
web.route('/api/v1/flows/:id/disable').patch(webAuth, patchFlowDisable);
web.route('/api/v1/flows/:id/enable').patch(webAuth, patchFlowEnable);
web.route('/api/v1/flows/:id/frequency').patch(webAuth, patchFlowFrequency);
web.route('/api/v1/flow/:flowName').get(webAuth, flowController.getFlow.bind(syncController));

web.route('/api/v1/onboarding').get(webAuth, onboardingController.status.bind(onboardingController));
web.route('/api/v1/onboarding').post(webAuth, onboardingController.create.bind(onboardingController));
web.route('/api/v1/onboarding').put(webAuth, onboardingController.updateStatus.bind(onboardingController));
web.route('/api/v1/onboarding/deploy').post(webAuth, onboardingController.deploy.bind(onboardingController));
web.route('/api/v1/onboarding/sync-status').post(webAuth, onboardingController.checkSyncCompletion.bind(onboardingController));
web.route('/api/v1/onboarding/action').post(webAuth, onboardingController.writeGithubIssue.bind(onboardingController));

web.route('/api/v1/logs/operations').post(webAuth, searchOperations);
web.route('/api/v1/logs/messages').post(webAuth, searchMessages);
web.route('/api/v1/logs/filters').post(webAuth, searchFilters);
web.route('/api/v1/logs/operations/:operationId').get(webAuth, getOperation);
web.route('/api/v1/logs/insights').post(webAuth, postInsights);

// Hosted signin
if (!isCloud && !isEnterprise) {
    web.route('/api/v1/basic').get(webAuth, (_: Request, res: Response) => {
        res.status(200).send();
    });
}

// -------
// 404
web.use('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'not_found', message: 'endpoint not found' } });
});

router.use(web);

// -------
// Webapp assets, static files and build.
const webappBuildPath = '../../../webapp/build';
const staticSite = express.Router();
staticSite.use('/assets', express.static(path.join(dirname(), webappBuildPath), { immutable: true, maxAge: '1y' }));
staticSite.use(express.static(path.join(dirname(), webappBuildPath), { cacheControl: true, maxAge: '1h' }));
staticSite.get('*', (_, res) => {
    const fp = path.join(dirname(), webappBuildPath, 'index.html');
    res.sendFile(fp, { headers: { 'Cache-Control': 'no-cache, private' } });
});
router.use(staticSite);

// -------
// Error handling.
router.use((err: any, req: Request, res: Response<ApiError<'invalid_json'>>, _: any) => {
    if (err instanceof SyntaxError && 'body' in err && 'type' in err && err.type === 'entity.parse.failed') {
        res.status(400).send({ error: { code: 'invalid_json', message: err.message } });
        return;
    }

    errorManager.handleGenericError(err, req, res, tracer);
});
