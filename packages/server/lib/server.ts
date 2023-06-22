/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

// Import environment variables (if running server locally).
import _ from './utils/config.js';
import oauthController from './controllers/oauth.controller.js';
import configController from './controllers/config.controller.js';
import connectionController from './controllers/connection.controller.js';
import authController from './controllers/auth.controller.js';
import authMiddleware from './controllers/access.middleware.js';
import userController from './controllers/user.controller.js';
import proxyController from './controllers/proxy.controller.js';
import activityController from './controllers/activity.controller.js';
import syncController from './controllers/sync.controller.js';
import path from 'path';
import { getGlobalOAuthCallbackUrl, packageJsonFile, dirname } from './utils/utils.js';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import express from 'express';
import cors from 'cors';
import webSocketClient from './clients/web-socket.client.js';
import { AuthClient } from './clients/auth.client.js';
import passport from 'passport';
import accountController from './controllers/account.controller.js';
import type { Response, Request } from 'express';
import Logger from './utils/logger.js';
import { accountService, getPort, isCloud, isBasicAuthEnabled, errorManager } from '@nangohq/shared';
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

app.use(express.json());
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

await accountService.cacheAccountSecrets();
await oAuthSessionService.clearStaleSessions();

// API routes (no/public auth).
app.get('/health', (_, res) => {
    res.status(200).send({ result: 'ok' });
});
app.route('/oauth/callback').get(oauthController.oauthCallback.bind(oauthController));
app.route('/oauth/connect/:providerConfigKey').get(apiPublicAuth, oauthController.oauthRequest.bind(oauthController));

// API routes (API key auth).
app.route('/config').get(apiAuth, configController.listProviderConfigs.bind(configController));
app.route('/config/:providerConfigKey').get(apiAuth, configController.getProviderConfig.bind(configController));
app.route('/config').post(apiAuth, configController.createProviderConfig.bind(configController));
app.route('/config').put(apiAuth, configController.editProviderConfig.bind(configController));
app.route('/config/:providerConfigKey').delete(apiAuth, configController.deleteProviderConfig.bind(configController));
app.route('/connection/:connectionId').get(apiAuth, connectionController.getConnectionCreds.bind(connectionController));
app.route('/connection').get(apiAuth, connectionController.listConnections.bind(connectionController));
app.route('/connection/:connectionId').delete(apiAuth, connectionController.deleteConnection.bind(connectionController));
app.route('/connection/:connectionId/field-mapping').post(apiAuth, connectionController.setFieldMapping.bind(connectionController));
app.route('/connection').post(apiAuth, connectionController.createConnection.bind(connectionController));
app.route('/sync/deploy').post(apiAuth, syncController.deploySync.bind(syncController));
app.route('/sync/reconcile').post(apiAuth, syncController.reconcileSyncs.bind(syncController));
app.route('/sync/records').get(apiAuth, syncController.getRecords.bind(syncController));
app.route('/sync/trigger').post(apiAuth, syncController.trigger.bind(syncController));

// Proxy Route
app.route('/proxy/*').all(apiAuth, proxyController.routeCall.bind(proxyController));

// Webapp routes (no auth).
if (isCloud()) {
    app.route('/api/v1/signup').post(authController.signup.bind(authController));
    app.route('/api/v1/logout').post(authController.logout.bind(authController));
    app.route('/api/v1/signin').post(passport.authenticate('local'), authController.signin.bind(authController));
    app.route('/api/v1/forgot-password').put(authController.forgotPassword.bind(authController));
    app.route('/api/v1/reset-password').put(authController.resetPassword.bind(authController));
}

// Webapp routes (session auth).
app.route('/api/v1/account').get(webAuth, accountController.getAccount.bind(accountController));
app.route('/api/v1/account/callback').post(webAuth, accountController.updateCallback.bind(accountController));
app.route('/api/v1/account/webhook').post(webAuth, accountController.updateWebhookURL.bind(accountController));
app.route('/api/v1/integration').get(webAuth, configController.listProviderConfigsWeb.bind(configController));
app.route('/api/v1/integration/:providerConfigKey').get(webAuth, configController.getProviderConfigWeb.bind(configController));
app.route('/api/v1/integration').put(webAuth, configController.editProviderConfigWeb.bind(connectionController));
app.route('/api/v1/integration').post(webAuth, configController.createProviderConfigWeb.bind(configController));
app.route('/api/v1/integration/:providerConfigKey').delete(webAuth, configController.deleteProviderConfigWeb.bind(connectionController));
app.route('/api/v1/provider').get(connectionController.listProviders.bind(connectionController));
app.route('/api/v1/connection').get(webAuth, connectionController.getConnectionsWeb.bind(connectionController));
app.route('/api/v1/connection/:connectionId').get(webAuth, connectionController.getConnectionWeb.bind(connectionController));
app.route('/api/v1/connection/:connectionId').delete(webAuth, connectionController.deleteConnectionWeb.bind(connectionController));
app.route('/api/v1/user').get(webAuth, userController.getUser.bind(userController));
app.route('/api/v1/activity').get(webAuth, activityController.retrieve.bind(activityController));
app.route('/api/v1/sync').get(webAuth, syncController.getSyncs.bind(syncController));
app.route('/api/v1/sync/command').post(webAuth, syncController.syncCommand.bind(syncController));

// Hosted signin
if (!isCloud()) {
    app.route('/api/v1/basic').get(webAuth, (_: Request, res: Response) => {
        res.status(200).send();
    });
}

// Error handling.
app.use((e: any, req: Request, res: Response, __: any) => {
    errorManager.handleGenericError(e, req, res);
});

// Webapp assets, static files and build.
const webappBuildPath = '../../../webapp/build';
app.use('/assets', express.static(path.join(dirname(), webappBuildPath), { immutable: true, maxAge: '1y' }));
app.use(express.static(path.join(dirname(), webappBuildPath), { setHeaders: () => ({ 'Cache-Control': 'no-cache, private' }) }));
app.get('*', (_, res) => {
    res.sendFile(path.join(dirname(), webappBuildPath, 'index.html'), { headers: { 'Cache-Control': 'no-cache, private' } });
});

const server = http.createServer(app);
const wsServer = new WebSocketServer({ server });

wsServer.on('connection', (ws: WebSocket) => {
    webSocketClient.addClient(ws);
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
