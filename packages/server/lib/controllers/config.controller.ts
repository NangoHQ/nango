import crypto from 'crypto';

import {
    configService,
    connectionService,
    errorManager,
    getGlobalWebhookReceiveUrl,
    getProvider,
    getProviders,
    sharedCredentialsService
} from '@nangohq/shared';
import { report } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { Integration as ProviderIntegration, IntegrationWithCreds } from '@nangohq/shared';
import type { NextFunction, Request, Response } from 'express';

class ConfigController {
    async listProvidersFromYaml(_: Request, res: Response<any, Required<RequestLocals>>) {
        const providers = getProviders();
        if (!providers) {
            res.status(500).send({ error: { code: 'server_error' } });
            return;
        }

        try {
            const sharedCredentials = await sharedCredentialsService.getPreConfiguredProviderScopes();

            const list = Object.entries(providers)
                .filter(([, properties]) => properties.auth_mode !== 'MCP_OAUTH2')
                .map((providerProperties) => {
                    const [provider, properties] = providerProperties;
                    // check if provider has nango's preconfigured credentials
                    const preConfiguredInfo = sharedCredentials.isOk() ? sharedCredentials.value[provider] : undefined;
                    const isPreConfigured = preConfiguredInfo ? preConfiguredInfo.preConfigured : false;
                    const preConfiguredScopes = preConfiguredInfo ? preConfiguredInfo.scopes : [];

                    return {
                        name: provider,
                        displayName: properties.display_name,
                        defaultScopes: properties.default_scopes,
                        authMode: properties.auth_mode,
                        categories: properties.categories,
                        docs: properties.docs,
                        preConfigured: isPreConfigured,
                        preConfiguredScopes: preConfiguredScopes
                    };
                });
            const sortedList = list.sort((a, b) => a.name.localeCompare(b.name));
            res.status(200).send(sortedList);
        } catch (err) {
            report(err);
            res.status(500).send({ error: { code: 'server_error' } });
        }
    }

    /**
     * Public api
     */
    async getProviderConfig(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environment = res.locals['environment'];
            const environmentId = environment.id;
            const providerConfigKey = req.params['providerConfigKey'] as string | null;
            const includeCreds = req.query['include_creds'] === 'true';

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);
            if (!config) {
                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            const provider = getProvider(config.provider);
            if (!provider) {
                errorManager.errRes(res, 'unknown_provider_template');
                return;
            }

            const authMode = provider.auth_mode;

            let client_secret = config.oauth_client_secret;
            let webhook_secret = null;
            const custom = config.custom;

            if (authMode === 'APP' && client_secret) {
                client_secret = Buffer.from(client_secret, 'base64').toString('ascii');
                const hash = `${config.oauth_client_id}${config.oauth_client_secret}${config.app_link}`;
                webhook_secret = crypto.createHash('sha256').update(hash).digest('hex');
            }

            if (authMode === 'CUSTOM' && custom) {
                const { private_key } = custom;
                custom['private_key'] = Buffer.from(custom['private_key'] as string, 'base64').toString('ascii');
                const hash = `${custom['app_id']}${private_key}${config.app_link}`;
                webhook_secret = crypto.createHash('sha256').update(hash).digest('hex');
            }

            const hasWebhook = provider.webhook_routing_script;
            let webhookUrl: string | null = null;
            if (hasWebhook) {
                webhookUrl = `${getGlobalWebhookReceiveUrl()}/${environment.uuid}/${config.provider}`;
            }

            let configRes: ProviderIntegration | IntegrationWithCreds;
            if (includeCreds) {
                const connections = await connectionService.getConnectionsByEnvironmentAndConfig(environmentId, providerConfigKey);
                const connection_count = connections.length;
                configRes = {
                    unique_key: config.unique_key,
                    provider: config.provider,
                    client_id: config.oauth_client_id,
                    client_secret,
                    custom: config.custom,
                    scopes: config.oauth_scopes,
                    app_link: config.app_link,
                    auth_mode: authMode,
                    created_at: config.created_at,
                    syncs: [],
                    actions: [],
                    has_webhook: Boolean(hasWebhook),
                    webhook_secret,
                    connections: connections.map(({ connection_config, connection_id, environment_id, id, provider_config_key }) => {
                        return { connection_config, connection_id, environment_id, id, provider_config_key };
                    }),
                    docs: provider.docs,
                    connection_count,
                    has_webhook_user_defined_secret: provider.webhook_user_defined_secret || false,
                    webhook_url: webhookUrl
                } satisfies IntegrationWithCreds;
            } else {
                configRes = { unique_key: config.unique_key, provider: config.provider, syncs: [], actions: [] } satisfies ProviderIntegration;
            }

            res.status(200).send({ config: configRes });
        } catch (err) {
            next(err);
        }
    }
}

export default new ConfigController();
