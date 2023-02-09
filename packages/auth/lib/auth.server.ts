/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import type { Express } from 'express';
import db from './db/database.js';
import oauthController from './controllers/oauth.controller.js';
import configController from './controllers/config.controller.js';
import connectionController from './controllers/connection.controller.js';
import auth from './controllers/access.middleware.js';
import path from 'path';
import { dirname, isCloud } from './utils/utils.js';
import accountController from './controllers/account.controller.js';

class AuthServer {
    async setup(app: Express) {
        await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
        await db.migrate(path.join(dirname(), '../../lib/db/migrations'));

        // Healthcheck.
        app.get('/', (_, res) => {
            res.status(200).send({ result: 'ok' });
        });

        // Main routes.
        app.route('/oauth/connect/:providerConfigKey').get(auth.public.bind(auth), oauthController.oauthRequest.bind(oauthController));
        app.route('/oauth/callback').get(oauthController.oauthCallback.bind(oauthController));
        app.route('/config').get(auth.secret.bind(auth), configController.listProviderConfigs.bind(configController));
        app.route('/config/:providerConfigKey').get(auth.secret.bind(auth), configController.getProviderConfig.bind(configController));
        app.route('/config').post(auth.secret.bind(auth), configController.createProviderConfig.bind(configController));
        app.route('/config').put(auth.secret.bind(auth), configController.editProviderConfig.bind(configController));
        app.route('/config/:providerConfigKey').delete(auth.secret.bind(auth), configController.deleteProviderConfig.bind(configController));
        app.route('/connection/:connectionId').get(auth.secret.bind(auth), connectionController.getConnectionCreds.bind(connectionController));
        app.route('/connection').get(auth.secret.bind(auth), connectionController.listConnections.bind(connectionController));

        // Admin routes.
        if (isCloud()) {
            app.route('/account').post(auth.admin.bind(auth), accountController.createAccount.bind(accountController));
        }

        // Error handling.
        app.use((error: any, _: any, response: any, __: any) => {
            const status = error.status || 500;
            response.status(status).send(error.message);
        });
    }
}

export default new AuthServer();
