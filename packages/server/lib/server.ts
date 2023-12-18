/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

// Import environment variables (if running server locally).
import './apm.js';
import _ from './utils/config.js';
import oauthController from './controllers/oauth.controller.js';
import configController from './controllers/config.controller.js';
import providerController from './controllers/provider.controller.js';
import connectionController from './controllers/connection.controller.js';
import authController from './controllers/auth.controller.js';
import unAuthController from './controllers/unauth.controller.js';
import authMiddleware from './controllers/access.middleware.js';
import userController from './controllers/user.controller.js';
import proxyController from './controllers/proxy.controller.js';
import activityController from './controllers/activity.controller.js';
import syncController from './controllers/sync.controller.js';
import flowController from './controllers/flow.controller.js';
import apiAuthController from './controllers/apiAuth.controller.js';
import appAuthController from './controllers/appAuth.controller.js';
import onboardingController from './controllers/onboarding.controller.js';
import webhookController from './controllers/webhook.controller.js';
import path from 'path';
import { packageJsonFile, dirname } from './utils/utils.js';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { AuthClient } from './clients/auth.client.js';
import publisher from './clients/publisher.client.js';
import passport from 'passport';
import environmentController from './controllers/environment.controller.js';
import accountController from './controllers/account.controller.js';
import type { Response, Request } from 'express';
import Logger from './utils/logger.js';
import { getGlobalOAuthCallbackUrl, environmentService, getPort, isCloud, isBasicAuthEnabled, errorManager, getWebsocketsPath } from '@nangohq/shared';
import oAuthSessionService from './services/oauth-session.service.js';
import { deleteOldActivityLogs } from './jobs/index.js';
import migrate from './utils/migrate.js';

const { NANGO_MIGRATE_AT_START = 'true' } = process.env;

const app = express();

// Auth
AuthClient.setup(app);
const apiAuth = authMiddleware.secretKeyAuth.bind(authMiddleware);
const apiPublicAuth = authMiddleware.publicKeyAuth.bind(authMiddleware);
const webAuth = isCloud()
    ? [passport.authenticate('session'), authMiddleware.sessionAuth.bind(authMiddleware)]
    : isBasicAuthEnabled()
    ? [passport.authenticate('basic', { session: false }), authMiddleware.basicAuth.bind(authMiddleware)]
    : [authMiddleware.noAuth.bind(authMiddleware)];

app.use(express.json({ limit: '75mb' }));
app.use(cors());

// Set to 'false' to disable migration at startup. Appropriate when you
// have multiple replicas of the service running and you do not want them
// all trying to migrate the database at the same time. In this case, the
// operator should run migrate.ts once before starting the service.
if (NANGO_MIGRATE_AT_START === 'true') {
    await migrate();
} else {
    Logger.info('Not migrating database');
}

await environmentService.cacheSecrets();
await oAuthSessionService.clearStaleSessions();

// API routes (no/public auth).
app.get('/health', (_, res) => {
    res.status(200).send({ result: 'ok' });
});
app.route('/oauth/callback').get(oauthController.oauthCallback.bind(oauthController));
app.route('/app-auth/connect').get(appAuthController.connect.bind(appAuthController));
app.route('/oauth/connect/:providerConfigKey').get(apiPublicAuth, oauthController.oauthRequest.bind(oauthController));
app.route('/webhook/:environmentUuid/:providerConfigKey').post(webhookController.receive.bind(proxyController));
app.route('/api-auth/api-key/:providerConfigKey').post(apiPublicAuth, apiAuthController.apiKey.bind(authController));
app.route('/api-auth/basic/:providerConfigKey').post(apiPublicAuth, apiAuthController.basic.bind(authController));
app.route('/unauth/:providerConfigKey').post(apiPublicAuth, unAuthController.create.bind(unAuthController));

// API routes (API key auth).
app.route('/provider').get(apiAuth, providerController.listProviders.bind(providerController));
app.route('/provider/:provider').get(apiAuth, providerController.getProvider.bind(providerController));
app.route('/config').get(apiAuth, configController.listProviderConfigs.bind(configController));
app.route('/config/:providerConfigKey').get(apiAuth, configController.getProviderConfig.bind(configController));
app.route('/config').post(apiAuth, configController.createProviderConfig.bind(configController));
app.route('/config').put(apiAuth, configController.editProviderConfig.bind(configController));
app.route('/config/:providerConfigKey').delete(apiAuth, configController.deleteProviderConfig.bind(configController));
app.route('/connection/:connectionId').get(apiAuth, connectionController.getConnectionCreds.bind(connectionController));
app.route('/connection').get(apiAuth, connectionController.listConnections.bind(connectionController));
app.route('/connection/:connectionId').delete(apiAuth, connectionController.deleteConnection.bind(connectionController));
app.route('/connection/:connectionId/metadata').post(apiAuth, connectionController.setMetadata.bind(connectionController));
app.route('/connection/:connectionId/metadata').patch(apiAuth, connectionController.updateMetadata.bind(connectionController));
app.route('/connection').post(apiAuth, connectionController.createConnection.bind(connectionController));
app.route('/environment-variables').get(apiAuth, environmentController.getEnvironmentVariables.bind(connectionController));
app.route('/sync/deploy').post(apiAuth, syncController.deploySync.bind(syncController));
app.route('/sync/deploy/confirmation').post(apiAuth, syncController.confirmation.bind(syncController));
app.route('/sync/records').get(apiAuth, syncController.getRecords.bind(syncController)); //TODO: to deprecate
app.route('/records').get(apiAuth, syncController.getAllRecords.bind(syncController));
app.route('/sync/trigger').post(apiAuth, syncController.trigger.bind(syncController));
app.route('/sync/pause').post(apiAuth, syncController.pause.bind(syncController));
app.route('/sync/start').post(apiAuth, syncController.start.bind(syncController));
app.route('/sync/provider').get(apiAuth, syncController.getSyncProvider.bind(syncController));
app.route('/sync/status').get(apiAuth, syncController.getSyncStatus.bind(syncController));
app.route('/flow/attributes').get(apiAuth, syncController.getFlowAttributes.bind(syncController));
app.route('/flow/configs').get(apiAuth, flowController.getFlowConfig.bind(flowController));
app.route('/action/trigger').post(apiAuth, syncController.triggerAction.bind(syncController)); //TODO: to deprecate

app.route('/v1/*').all(apiAuth, syncController.actionOrModel.bind(syncController));

app.route('/admin/flow/deploy/pre-built').post(apiAuth, flowController.adminDeployPrivateFlow.bind(flowController));

// Proxy Route
app.route('/proxy/*').all(apiAuth, proxyController.routeCall.bind(proxyController));

// Webapp routes (no auth).
if (isCloud()) {
    app.route('/api/v1/signup').post(authController.signup.bind(authController));
    app.route('/api/v1/signup/invite').get(authController.invitation.bind(authController));
    app.route('/api/v1/logout').post(authController.logout.bind(authController));
    app.route('/api/v1/signin').post(passport.authenticate('local'), authController.signin.bind(authController));
    app.route('/api/v1/forgot-password').put(authController.forgotPassword.bind(authController));
    app.route('/api/v1/reset-password').put(authController.resetPassword.bind(authController));
}

// Webapp routes (session auth).
app.route('/api/v1/meta').get(webAuth, environmentController.meta.bind(environmentController));
app.route('/api/v1/account').get(webAuth, accountController.getAccount.bind(accountController));
app.route('/api/v1/account').put(webAuth, accountController.editAccount.bind(accountController));
app.route('/api/v1/account/admin/switch').post(webAuth, accountController.switchAccount.bind(accountController));

app.route('/api/v1/environment').get(webAuth, environmentController.getEnvironment.bind(environmentController));
app.route('/api/v1/environment/callback').post(webAuth, environmentController.updateCallback.bind(environmentController));
app.route('/api/v1/environment/webhook').post(webAuth, environmentController.updateWebhookURL.bind(environmentController));
app.route('/api/v1/environment/hmac').get(webAuth, environmentController.getHmacDigest.bind(environmentController));
app.route('/api/v1/environment/hmac-enabled').post(webAuth, environmentController.updateHmacEnabled.bind(environmentController));
app.route('/api/v1/environment/webhook-send').post(webAuth, environmentController.updateAlwaysSendWebhook.bind(environmentController));
app.route('/api/v1/environment/slack-notifications-enabled').post(webAuth, environmentController.updateSlackNotificationsEnabled.bind(environmentController));
app.route('/api/v1/environment/hmac-key').post(webAuth, environmentController.updateHmacKey.bind(environmentController));
app.route('/api/v1/environment/environment-variables').post(webAuth, environmentController.updateEnvironmentVariables.bind(environmentController));
app.route('/api/v1/environment/rotate-key').post(webAuth, environmentController.rotateKey.bind(accountController));
app.route('/api/v1/environment/revert-key').post(webAuth, environmentController.revertKey.bind(accountController));
app.route('/api/v1/environment/activate-key').post(webAuth, environmentController.activateKey.bind(accountController));
app.route('/api/v1/environment/admin-auth').get(webAuth, environmentController.getAdminAuthInfo.bind(environmentController));

app.route('/api/v1/integration').get(webAuth, configController.listProviderConfigsWeb.bind(configController));
app.route('/api/v1/integration/:providerConfigKey').get(webAuth, configController.getProviderConfig.bind(configController));
app.route('/api/v1/integration').put(webAuth, configController.editProviderConfigWeb.bind(connectionController));
app.route('/api/v1/integration').post(webAuth, configController.createProviderConfig.bind(configController));
app.route('/api/v1/integration/:providerConfigKey').delete(webAuth, configController.deleteProviderConfig.bind(connectionController));

app.route('/api/v1/provider').get(connectionController.listProviders.bind(connectionController));

app.route('/api/v1/connection').get(webAuth, connectionController.listConnections.bind(connectionController));
app.route('/api/v1/connection/:connectionId').get(webAuth, connectionController.getConnectionWeb.bind(connectionController));
app.route('/api/v1/connection/:connectionId').delete(webAuth, connectionController.deleteConnection.bind(connectionController));
app.route('/api/v1/connection/admin/:connectionId').delete(webAuth, connectionController.deleteAdminConnection.bind(connectionController));

app.route('/api/v1/user').get(webAuth, userController.getUser.bind(userController));
app.route('/api/v1/user/name').put(webAuth, userController.editName.bind(userController));
app.route('/api/v1/user/password').put(webAuth, userController.editPassword.bind(userController));
app.route('/api/v1/users/:userId/suspend').post(webAuth, userController.suspend.bind(userController));
app.route('/api/v1/users/invite').post(webAuth, userController.invite.bind(userController));

app.route('/api/v1/activity').get(webAuth, activityController.retrieve.bind(activityController));
app.route('/api/v1/activity-messages').get(webAuth, activityController.getMessages.bind(activityController));

app.route('/api/v1/sync').get(webAuth, syncController.getSyncsByParams.bind(syncController));
app.route('/api/v1/sync/command').post(webAuth, syncController.syncCommand.bind(syncController));
app.route('/api/v1/syncs').get(webAuth, syncController.getSyncs.bind(syncController));
app.route('/api/v1/flows').get(webAuth, flowController.getFlows.bind(syncController));
app.route('/api/v1/flow/deploy/pre-built').post(webAuth, flowController.deployPreBuiltFlow.bind(flowController));
app.route('/api/v1/flow/download').post(webAuth, flowController.downloadFlow.bind(flowController));
app.route('/api/v1/flow/:id').delete(webAuth, flowController.deleteFlow.bind(flowController));

app.route('/api/v1/onboarding').get(webAuth, onboardingController.status.bind(onboardingController));
app.route('/api/v1/onboarding').post(webAuth, onboardingController.init.bind(onboardingController));
app.route('/api/v1/onboarding/verify').post(webAuth, onboardingController.verify.bind(onboardingController));
app.route('/api/v1/onboarding/:id').put(webAuth, onboardingController.updateStatus.bind(onboardingController));
app.route('/api/v1/onboarding/sync-status').get(webAuth, onboardingController.checkSyncCompletion.bind(onboardingController));

// Hosted signin
if (!isCloud()) {
    app.route('/api/v1/basic').get(webAuth, (_: Request, res: Response) => {
        res.status(200).send();
    });
}

// Error handling.
app.use(async (e: any, req: Request, res: Response, __: any) => {
    await errorManager.handleGenericError(e, req, res);
});

// Webapp assets, static files and build.
const webappBuildPath = '../../../webapp/build';
app.use('/assets', express.static(path.join(dirname(), webappBuildPath), { immutable: true, maxAge: '1y' }));
app.use(express.static(path.join(dirname(), webappBuildPath), { setHeaders: () => ({ 'Cache-Control': 'no-cache, private' }) }));
app.get('*', (_, res) => {
    res.sendFile(path.join(dirname(), webappBuildPath, 'index.html'), { headers: { 'Cache-Control': 'no-cache, private' } });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: getWebsocketsPath() });

wss.on('connection', async (ws: WebSocket) => {
    await publisher.subscribe(ws);
});

// kick off any job
deleteOldActivityLogs();

const port = getPort();
server.listen(port, () => {
    Logger.info(`✅ Nango Server with version ${packageJsonFile().version} is listening on port ${port}. OAuth callback URL: ${getGlobalOAuthCallbackUrl()}`);
    Logger.info(
        `\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch Nango at http://localhost:${port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`
    );
});
