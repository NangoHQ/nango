/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import express from 'express';
import logger from './utils/logger.js';
import db from './db/database.js';
import oauthController from './controllers/oauth.contoller.js';
import configController from './controllers/config.controller.js';
import connectionController from './controllers/connection.controller.js';
import { getOauthCallbackUrl, getPort } from './utils/utils.js';

await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
await db.migrate(process.env['PIZZLY_DB_MIGRATION_FOLDER'] || './lib/db/migrations');

let port = getPort();
let callbackUrl = getOauthCallbackUrl();

let app = express();

app.route('/oauth/connect/:integrationKey').get(oauthController.oauthRequest);
app.route('/oauth/callback').get(oauthController.oauthCallback);

app.route('/config').get(configController.listIntegrationConfigs);
app.route('/config/:integrationKey').get(configController.getIntegrationConfig);
app.route('/config').post(configController.createIntegrationConfig);
app.route('/config').put(configController.editIntegrationConfig);
app.route('/config/:integrationKey').delete(configController.deleteIntegrationConfig);

app.route('/connection/:connectionId').get(connectionController.getConnectionCredentials);

app.listen(port, () => {
    logger.info(`✅ Pizzly Server is listening on port ${port}. OAuth callback URL: ${callbackUrl}`);
});
