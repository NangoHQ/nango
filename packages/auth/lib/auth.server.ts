/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import type { Express } from 'express';
import db from './db/database.js';
import oauthController from './controllers/oauth.controller.js';
import configController from './controllers/config.controller.js';
import connectionController from './controllers/connection.controller.js';
import accessMiddleware from './controllers/access.middleware.js';
import path from 'path';
import { dirname } from './utils/utils.js';

class AuthServer {
    async setup(app: Express) {
        await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
        await db.migrate(path.join(dirname(), '../../lib/db/migrations'));

        app.route('/oauth/connect/:providerConfigKey').get(
            accessMiddleware.checkPkey.bind(accessMiddleware),
            oauthController.oauthRequest.bind(oauthController)
        );
        app.route('/oauth/callback').get(oauthController.oauthCallback.bind(oauthController));
        app.route('/config').get(accessMiddleware.checkSecret.bind(accessMiddleware), configController.listProviderConfigs.bind(configController));
        app.route('/config/:providerConfigKey').get(
            accessMiddleware.checkSecret.bind(accessMiddleware),
            configController.getProviderConfig.bind(configController)
        );
        app.route('/config').post(accessMiddleware.checkSecret.bind(accessMiddleware), configController.createProviderConfig.bind(configController));
        app.route('/config').put(accessMiddleware.checkSecret.bind(accessMiddleware), configController.editProviderConfig.bind(configController));
        app.route('/config/:providerConfigKey').delete(
            accessMiddleware.checkSecret.bind(accessMiddleware),
            configController.deleteProviderConfig.bind(configController)
        );
        app.route('/connection/:connectionId').get(
            accessMiddleware.checkSecret.bind(accessMiddleware),
            connectionController.getConnectionCreds.bind(connectionController)
        );
    }
}

export default new AuthServer();
