/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

// Import environment variables (if running server locally).
import * as dotenv from 'dotenv';
if (process.env['SERVER_RUN_MODE'] !== 'DOCKERIZED') {
    dotenv.config({ path: '../../.env' });
}

import db from './db/database.js';
import oauthController from './controllers/oauth.controller.js';
import configController from './controllers/config.controller.js';
import connectionController from './controllers/connection.controller.js';
import authController from './controllers/auth.controller.js';
import authMiddleware from './controllers/access.middleware.js';
import path from 'path';
import {
    dirname,
    getAccount,
    isApiAuthenticated,
    isUserAuthenticated,
    getPort,
    getGlobalOAuthCallbackUrl,
    isCloud,
    isBasicAuthEnabled
} from './utils/utils.js';
import errorManager from './utils/error.manager.js';
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

let app = express();

// Auth
AuthClient.setup(app);
let apiAuth = authMiddleware.publicKeyAuth.bind(authMiddleware);
let webAuth = isCloud()
    ? [passport.authenticate('session'), authMiddleware.sessionAuth.bind(authMiddleware)]
    : isBasicAuthEnabled()
    ? [passport.authenticate('basic', { session: false }), authMiddleware.basicAuth.bind(authMiddleware)]
    : [authMiddleware.noAuth.bind(authMiddleware)];

app.use(express.json());
app.use(cors());

await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
await db.migrate(path.join(dirname(), '../../lib/db/migrations'));

// API routes (no auth).
app.get('/health', (_, res) => {
    res.status(200).send({ result: 'ok' });
});
app.route('/oauth/callback').get(oauthController.oauthCallback.bind(oauthController));

// API routes (API key auth).
app.route('/oauth/connect/:providerConfigKey').get(apiAuth, oauthController.oauthRequest.bind(oauthController));
app.route('/config').get(apiAuth, configController.listProviderConfigs.bind(configController));
app.route('/config/:providerConfigKey').get(apiAuth, configController.getProviderConfig.bind(configController));
app.route('/config').post(apiAuth, configController.createProviderConfig.bind(configController));
app.route('/config').put(apiAuth, configController.editProviderConfig.bind(configController));
app.route('/config/:providerConfigKey').delete(apiAuth, configController.deleteProviderConfig.bind(configController));
app.route('/connection/:connectionId').get(apiAuth, connectionController.getConnectionCreds.bind(connectionController));
app.route('/connection').get(apiAuth, connectionController.listConnections.bind(connectionController));
app.route('/connection/:connectionId').delete(apiAuth, connectionController.deleteConnection.bind(connectionController));

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
app.route('/api/v1/integration').get(webAuth, configController.listProviderConfigsWeb.bind(configController));
app.route('/api/v1/integration/:providerConfigKey').get(webAuth, configController.getProviderConfigWeb.bind(configController));
app.route('/api/v1/integration').put(webAuth, configController.editProviderConfigWeb.bind(connectionController));
app.route('/api/v1/integration').post(webAuth, configController.createProviderConfigWeb.bind(configController));
app.route('/api/v1/integration/:providerConfigKey').delete(webAuth, configController.deleteProviderConfigWeb.bind(connectionController));
app.route('/api/v1/provider').get(connectionController.listProviders.bind(connectionController));
app.route('/api/v1/connection').get(webAuth, connectionController.getConnectionsWeb.bind(connectionController));
app.route('/api/v1/connection/:connectionId').get(webAuth, connectionController.getConnectionWeb.bind(connectionController));
app.route('/api/v1/connection/:connectionId').delete(webAuth, connectionController.deleteConnectionWeb.bind(connectionController));

// Hosted signin
if (!isCloud()) {
    app.route('/api/v1/basic').get(webAuth, (_: Request, res: Response) => {
        res.status(200).send();
    });
}

// Error handling.
app.use((e: any, req: Request, res: Response, __: any) => {
    if (isApiAuthenticated(res)) {
        errorManager.report(e, { accountId: getAccount(res) });
    } else if (isUserAuthenticated(req)) {
        errorManager.report(e, { userId: req.user!.id });
    } else {
        errorManager.report(e);
    }

    errorManager.res(res, 'server_error');
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

let port = getPort();
server.listen(port, () => {
    Logger.info(`✅ Nango Server is listening on port ${port}. OAuth callback URL: ${getGlobalOAuthCallbackUrl()}`);
    Logger.info(
        `\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch Nango at http://localhost:${port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`
    );
});
