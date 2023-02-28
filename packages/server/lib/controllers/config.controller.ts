import type { Request, Response, NextFunction } from 'express';
import configService from '../services/config.service.js';
import type { ProviderConfig } from '../models.js';
import analytics from '../utils/analytics.js';
import { getAccount } from '../utils/utils.js';
import errorManager from '../utils/error.manager.js';

class ConfigController {
    async listProviderConfigs(_: Request, res: Response, next: NextFunction) {
        try {
            let accountId = getAccount(res);
            let configs = await configService.listProviderConfigs(accountId);
            res.status(200).send({ configs: configs });
        } catch (err) {
            next(err);
        }
    }

    async getProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            let accountId = getAccount(res);
            let providerConfigKey = req.params['providerConfigKey'] as string;

            if (providerConfigKey == null) {
                errorManager.res(res, 'missing_provider_config');
                return;
            }

            let config = await configService.getProviderConfig(providerConfigKey, accountId);

            if (config == null) {
                errorManager.res(res, 'unknown_provider_config');
                return;
            }

            res.status(200).send({ config: config });
        } catch (err) {
            next(err);
        }
    }

    async createProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            let accountId = getAccount(res);
            if (req.body == null) {
                errorManager.res(res, 'missing_body');
                return;
            }

            if (req.body['provider_config_key'] == null) {
                errorManager.res(res, 'missing_provider_config');
                return;
            }

            if (req.body['provider'] == null) {
                errorManager.res(res, 'missing_provider_template');
                return;
            }

            let provider = req.body['provider'];

            if (!configService.checkProviderTemplateExists(provider)) {
                errorManager.res(res, 'unknown_provider_template');
                return;
            }

            if (req.body['oauth_client_id'] == null) {
                errorManager.res(res, 'missing_client_id');
                return;
            }

            if (req.body['oauth_client_secret'] == null) {
                errorManager.res(res, 'missing_client_secret');
                return;
            }

            if (req.body['oauth_scopes'] == null) {
                errorManager.res(res, 'missing_scopes');
                return;
            }

            let uniqueConfigKey = req.body['provider_config_key'];

            if ((await configService.getProviderConfig(uniqueConfigKey, accountId)) != null) {
                errorManager.res(res, 'duplicate_provider_config');
                return;
            }

            let config: ProviderConfig = {
                unique_key: uniqueConfigKey,
                provider: provider,
                oauth_client_id: req.body['oauth_client_id'],
                oauth_client_secret: req.body['oauth_client_secret'],
                oauth_scopes: req.body['oauth_scopes']
                    .replace(/ /g, ',')
                    .split(',')
                    .filter((w: string) => w)
                    .join(','), // Make coma-separated if needed
                account_id: accountId
            };

            let result = await configService.createProviderConfig(config);

            if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
                let configId = result[0]['id'];

                analytics.track('server:config_created', accountId, { provider: config.provider });
                res.status(200).send({ config_id: configId });
            } else {
                throw new Error('provider_config_creation_failure');
            }
        } catch (err) {
            next(err);
        }
    }

    async editProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            let accountId = getAccount(res);
            if (req.body == null) {
                errorManager.res(res, 'missing_body');
                return;
            }

            if (req.body['provider_config_key'] == null) {
                errorManager.res(res, 'missing_provider_config');
                return;
            }

            if (req.body['provider'] == null) {
                errorManager.res(res, 'missing_provider_template');
                return;
            }
            if (req.body['oauth_client_id'] == null) {
                errorManager.res(res, 'missing_client_id');
                return;
            }
            if (req.body['oauth_client_secret'] == null) {
                errorManager.res(res, 'missing_client_secret');
                return;
            }

            if (req.body['oauth_scopes'] == null) {
                errorManager.res(res, 'missing_scopes');
                return;
            }

            let newConfig: ProviderConfig = {
                unique_key: req.body['provider_config_key'],
                provider: req.body['provider'],
                oauth_client_id: req.body['oauth_client_id'],
                oauth_client_secret: req.body['oauth_client_secret'],
                oauth_scopes: req.body['oauth_scopes'],
                account_id: accountId
            };

            let oldConfig = await configService.getProviderConfig(newConfig.unique_key, accountId);

            if (oldConfig == null) {
                errorManager.res(res, 'unknown_provider_config');
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
            let accountId = getAccount(res);
            let providerConfigKey = req.params['providerConfigKey'] as string;

            if (providerConfigKey == null) {
                errorManager.res(res, 'missing_provider_config');
                return;
            }

            await configService.deleteProviderConfig(providerConfigKey, accountId);

            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new ConfigController();
