import type { Request, Response } from 'express';
import connectionService from '../services/connection.service.js';
import type { NextFunction } from 'express';
import configService from '../services/config.service.js';
import { ProviderConfig, ProviderTemplate, Connection, ProviderAuthModes } from '../models.js';

class ConnectionController {
    templates: { [key: string]: ProviderTemplate } = configService.getTemplates();

    async getConnectionCreds(req: Request, res: Response, next: NextFunction) {
        try {
            let connectionId = req.params['connectionId'] as string;
            let providerConfigKey = req.query['provider_config_key'] as string;

            if (connectionId == null) {
                res.status(400).send({ error: `Missing param connection_id.` });
                return;
            }

            if (providerConfigKey == null) {
                res.status(400).send({ error: `Missing param provider_config_key.` });
                return;
            }

            let connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey);

            if (connection == null) {
                res.status(400).send({ error: `No matching connection for connection_id: ${connectionId} and provider_config_key: ${providerConfigKey}` });
                return;
            }

            let config: ProviderConfig | null = await configService.getProviderConfig(connection.provider_config_key);

            if (config == null) {
                res.status(400).send({ error: `No matching provider configuration for key: ${providerConfigKey}` });
                return;
            }

            let template: ProviderTemplate | undefined = this.templates[config.provider];

            if (template == null) {
                res.status(400).send({
                    error: `No matching template '${config.provider}' (provider_config_key: ${providerConfigKey}, connection_id: ${connectionId})`
                });
                return;
            }

            if (connection.credentials.type === ProviderAuthModes.OAuth2) {
                connection.credentials = await connectionService.refreshOauth2CredentialsIfNeeded(
                    connection.credentials,
                    connection.connection_id,
                    connection.provider_config_key,
                    config,
                    template
                );
            }

            res.status(200).send(connection);
        } catch (err) {
            next(err);
        }
    }
}

export default new ConnectionController();
