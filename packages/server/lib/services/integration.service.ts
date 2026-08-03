import db from '@nangohq/database';
import { configService, getGlobalWebhookReceiveUrl, getProvider, getProviders } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { getIntegrationCredentials } from '../utils/integrations.js';

import type { IntegrationCredentials } from '../utils/integrations.js';
import type { IntegrationConfig, Provider } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

type IntegrationServiceErrorCode = 'get_failed' | 'not_found' | 'list_failed';

export class IntegrationServiceError extends Error {
    public code: IntegrationServiceErrorCode;

    constructor({ code, message, cause }: { code: IntegrationServiceErrorCode; message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'IntegrationServiceError';
        this.code = code;
    }
}

export interface ListedIntegration {
    integration: IntegrationConfig;
    provider: Provider;
}

export interface RetrievedIntegration extends ListedIntegration {
    webhookUrl?: string | null;
    credentials?: IntegrationCredentials;
}

class IntegrationService {
    async get({
        environmentId,
        environmentUuid,
        integrationId,
        includeWebhook = false,
        includeCredentials = false
    }: {
        environmentId: number;
        environmentUuid: string;
        integrationId: string;
        includeWebhook?: boolean;
        includeCredentials?: boolean;
    }): Promise<Result<RetrievedIntegration, IntegrationServiceError>> {
        try {
            const integration = await configService.getProviderConfig(integrationId, environmentId);
            if (!integration) {
                return Err(
                    new IntegrationServiceError({
                        code: 'not_found',
                        message: `Integration "${integrationId}" does not exist`
                    })
                );
            }

            const provider = getProvider(integration.provider);
            if (!provider) {
                return Err(
                    new IntegrationServiceError({
                        code: 'not_found',
                        message: `Unknown provider ${integration.provider}`
                    })
                );
            }

            return Ok({
                integration,
                provider,
                ...(includeWebhook
                    ? {
                          webhookUrl: provider.webhook_routing_script
                              ? `${getGlobalWebhookReceiveUrl()}/${environmentUuid}/${encodeURIComponent(integration.unique_key)}`
                              : null
                      }
                    : {}),
                ...(includeCredentials ? { credentials: getIntegrationCredentials(integration, provider) } : {})
            });
        } catch (err) {
            return Err(
                new IntegrationServiceError({
                    code: 'get_failed',
                    message: 'Failed to get integration',
                    cause: err
                })
            );
        }
    }

    async list({
        environmentId,
        allowedIntegrations
    }: {
        environmentId: number;
        allowedIntegrations?: string[] | null;
    }): Promise<Result<ListedIntegration[], IntegrationServiceError>> {
        try {
            let configs = await configService.listProviderConfigs(db.knex, environmentId);

            const providers = getProviders();
            if (!providers) {
                return Err(
                    new IntegrationServiceError({
                        code: 'list_failed',
                        message: 'failed to load providers'
                    })
                );
            }

            if (allowedIntegrations) {
                configs = configs.filter((config) => allowedIntegrations.includes(config.unique_key));
            }

            const integrations: ListedIntegration[] = [];
            for (const config of configs) {
                const provider = providers[config.provider];
                if (!provider) {
                    return Err(
                        new IntegrationServiceError({
                            code: 'list_failed',
                            message: 'Failed to list integrations',
                            cause: new Error(`Provider '${config.provider}' does not exist`)
                        })
                    );
                }
                integrations.push({ integration: config, provider });
            }

            return Ok(integrations);
        } catch (err) {
            return Err(
                new IntegrationServiceError({
                    code: 'list_failed',
                    message: 'Failed to list integrations',
                    cause: err
                })
            );
        }
    }
}

export default new IntegrationService();
