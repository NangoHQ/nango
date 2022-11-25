import type { Request, Response } from 'express';
import configService from '../services/config.service.js';
import type { IntegrationConfig } from '../models.js';

class ConfigController {
    async listIntegrationConfigs(_: Request, res: Response) {
        let configs = await configService.listIntegrationConfigs();
        res.status(200).send({ configs: configs });
    }

    async getIntegrationConfig(req: Request, res: Response) {
        let integrationKey = req.query['integration_key'] as string;

        if (integrationKey == null) {
            res.status(400).send({ error: `Missing param integration_key.` });
            return;
        }

        let config = await configService.getIntegrationConfig(integrationKey);

        if (config == null) {
            res.status(400).send({ error: `There is no matching integration configuration for integration_key: ${integrationKey}` });
            return;
        }

        res.status(200).send({ config: config });
    }

    async createIntegrationConfig(req: Request, res: Response) {
        if (req.body['unique_key'] == null) {
            res.status(400).send({ error: `Missing param unique_key.` });
            return;
        }

        if (req.body['type'] == null) {
            res.status(400).send({ error: `Missing param type.` });
            return;
        }
        if (req.body['oauth_client_id'] == null) {
            res.status(400).send({ error: `Missing param oauth_client_id.` });
            return;
        }
        if (req.body['oauth_client_secret'] == null) {
            res.status(400).send({ error: `Missing param oauth_client_secret.` });
            return;
        }

        if (req.body['oauth_scopes'] == null) {
            res.status(400).send({ error: `Missing param oauth_scopes` });
            return;
        }

        let config: IntegrationConfig = {
            unique_key: req.body['unique_key'],
            type: req.body['type'],
            oauth_client_id: req.body['oauth_client_id'],
            oauth_client_secret: req.body['oauth_client_secret'],
            oauth_scopes: req.body['oauth_scopes']
        };

        let result = await configService.createIntegrationConfig(config);

        if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
            let configId = result[0]['id'];
            res.status(200).send({ config_id: configId });
        } else {
            res.status(500).send({
                error: `There was an unknown error creating your integration config.`
            });
        }
    }

    async editIntegrationConfig(req: Request, res: Response) {
        if (req.body['unique_key'] == null) {
            res.status(400).send({ error: `Missing param unique_key.` });
            return;
        }

        if (req.body['type'] == null) {
            res.status(400).send({ error: `Missing param type.` });
            return;
        }
        if (req.body['oauth_client_id'] == null) {
            res.status(400).send({ error: `Missing param oauth_client_id.` });
            return;
        }
        if (req.body['oauth_client_secret'] == null) {
            res.status(400).send({ error: `Missing param oauth_client_secret.` });
            return;
        }

        if (req.body['oauth_scopes'] == null) {
            res.status(400).send({ error: `Missing param oauth_scopes` });
            return;
        }

        let newConfig: IntegrationConfig = {
            unique_key: req.body['unique_key'],
            type: req.body['type'],
            oauth_client_id: req.body['oauth_client_id'],
            oauth_client_secret: req.body['oauth_client_secret'],
            oauth_scopes: req.body['oauth_scopes']
        };

        let oldConfig = await configService.getIntegrationConfig(newConfig.unique_key);

        if (oldConfig == null) {
            res.status(400).send({ error: `There is no matching integration configuration for integration_key: ${newConfig.unique_key}` });
            return;
        }

        await configService.editIntegrationConfig(newConfig);
        res.status(200);
    }

    async deleteIntegrationConfig(req: Request, res: Response) {
        let integrationKey = req.query['integration_key'] as string;

        if (integrationKey == null) {
            res.status(400).send({ error: `Missing param integration_key.` });
            return;
        }

        await configService.deleteIntegrationConfig(integrationKey);

        res.status(200);
    }
}

export default new ConfigController();
