import type { Request, Response } from 'express';
import configService from '../services/config.service.js';
import type { ProviderConfig } from '../models.js';
import type { NextFunction } from 'express';
import analytics from '../utils/analytics.js';

class ConfigController {
    async listProviderConfigs(_: Request, res: Response, next: NextFunction) {
        try {
            let configs = await configService.listProviderConfigs();
            res.status(200).send({ configs: configs });
        } catch (err) {
            next(err);
        }
    }

    async getProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            let providerConfigKey = req.params['providerConfigKey'] as string;

            if (providerConfigKey == null) {
                res.status(400).send({ error: `Missing param provider_config_key.` });
                return;
            }

            let config = await configService.getProviderConfig(providerConfigKey);

            if (config == null) {
                res.status(400).send({ error: `There is no matching provider configuration with key: ${providerConfigKey}` });
                return;
            }

            res.status(200).send({ config: config });
        } catch (err) {
            next(err);
        }
    }

    async createProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            if (req.body == null) {
                res.status(400).send({ error: `Missing request body.` });
                return;
            }

            if (req.body['provider_config_key'] == null) {
                res.status(400).send({ error: `Missing param provider_config_key.` });
                return;
            }

            if (req.body['provider'] == null) {
                res.status(400).send({ error: `Missing param provider.` });
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

            let config: ProviderConfig = {
                unique_key: req.body['provider_config_key'],
                provider: req.body['provider'],
                oauth_client_id: req.body['oauth_client_id'],
                oauth_client_secret: req.body['oauth_client_secret'],
                oauth_scopes: req.body['oauth_scopes']
            };

            let result = await configService.createProviderConfig(config);

            if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
                let configId = result[0]['id'];

                analytics.track('server:config_created', { provider: config.provider });
                res.status(200).send({ config_id: configId });
            } else {
                res.status(500).send({
                    error: `There was an unknown error creating your provider config.`
                });
            }
        } catch (err) {
            next(err);
        }
    }

    async editProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            if (req.body == null) {
                res.status(400).send({ error: `Missing request body.` });
                return;
            }

            if (req.body['provider_config_key'] == null) {
                res.status(400).send({ error: `Missing param provider_config_key.` });
                return;
            }

            if (req.body['provider'] == null) {
                res.status(400).send({ error: `Missing param provider.` });
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

            let newConfig: ProviderConfig = {
                unique_key: req.body['provider_config_key'],
                provider: req.body['provider'],
                oauth_client_id: req.body['oauth_client_id'],
                oauth_client_secret: req.body['oauth_client_secret'],
                oauth_scopes: req.body['oauth_scopes']
            };

            let oldConfig = await configService.getProviderConfig(newConfig.unique_key);

            if (oldConfig == null) {
                res.status(400).send({ error: `There is no matching provider configuration for provider_config_key: ${newConfig.unique_key}` });
                return;
            }

            await configService.editProviderConfig(newConfig);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async deleteProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            let providerConfigKey = req.params['providerConfigKey'] as string;

            if (providerConfigKey == null) {
                res.status(400).send({ error: `Missing param provider_config_key.` });
                return;
            }

            await configService.deleteProviderConfig(providerConfigKey);

            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new ConfigController();
