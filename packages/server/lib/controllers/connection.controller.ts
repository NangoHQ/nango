import type { Request, Response } from 'express';
import connectionService from '../services/connection.service.js';
import type { NextFunction } from 'express';
import configService from '../services/config.service.js';
import { IntegrationConfig, IntegrationTemplate, Connection, IntegrationAuthModes } from '../models.js';
import yaml from 'js-yaml';
import fs from 'fs';

class ConnectionController {
    templates: { [key: string]: IntegrationTemplate };

    constructor() {
        this.templates = yaml.load(fs.readFileSync('./templates.yaml').toString()) as { string: IntegrationTemplate };
    }

    async getConnectionCredentials(req: Request, res: Response, next: NextFunction) {
        try {
            let connectionId = req.params['connectionId'] as string;
            let integrationKey = req.query['integration_key'] as string;

            if (connectionId == null) {
                res.status(400).send({ error: `Missing param connection_id.` });
                return;
            }

            if (integrationKey == null) {
                res.status(400).send({ error: `Missing param integration_key.` });
                return;
            }

            let connection: Connection | null = await connectionService.getConnection(connectionId, integrationKey);

            if (connection == null) {
                res.status(400).send({ error: `No matching connection for connection_id: ${connectionId} and integration_key: ${integrationKey}` });
                return;
            }

            let config: IntegrationConfig | null = await configService.getIntegrationConfig(connection.integration_key);

            if (config == null) {
                res.status(400).send({ error: `No matching Integration configuration for integration_key: ${integrationKey}` });
                return;
            }

            let template: IntegrationTemplate | undefined = this.templates[config.type];

            if (template == null) {
                res.status(400).send({
                    error: `No matching template '${config.type}' (integration_key: ${integrationKey}, connection_id: ${connectionId})`
                });
                return;
            }

            if (connection.credentials.type === IntegrationAuthModes.OAuth2) {
                connection.credentials = await connectionService.refreshOauth2CredentialsIfNeeded(
                    connection.credentials,
                    connection.connection_id,
                    connection.integration_key,
                    config,
                    template
                );
            }

            res.status(200).send({ connection: connection });
        } catch (err) {
            next(err);
        }
    }
}

export default new ConnectionController();
