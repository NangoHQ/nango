import db from '@nangohq/database';
import { configService, getGlobalWebhookReceiveUrl, getProvider, getProviders, sharedCredentialsService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { getIntegrationCredentials } from '../utils/integrations.js';
import { resolveIntegrationConfig } from './integrationConfig.js';

import type { IntegrationCredentials } from '../utils/integrations.js';
import type { DBCreateIntegration, IntegrationConfig, Provider } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

type IntegrationServiceErrorCode =
    | 'get_failed'
    | 'not_found'
    | 'list_failed'
    | 'invalid_provider'
    | 'incompatible_credentials'
    | 'missing_credentials'
    | 'nango_credentials_unsupported'
    | 'integration_exists'
    | 'shared_credentials_load_failed'
    | 'shared_credentials_not_found'
    | 'invalid_integration_config'
    | 'create_failed';

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

export type CreatedIntegration = ListedIntegration;

export type CreateIntegrationCredentials =
    | {
          type: 'OAUTH1' | 'OAUTH2' | 'TBA';
          client_id: string;
          client_secret: string;
          scopes?: string | undefined;
          webhook_secret?: string | undefined;
      }
    | {
          type: 'APP';
          app_id: string;
          app_link: string;
          private_key: string;
      }
    | {
          type: 'CUSTOM';
          client_id: string;
          client_secret: string;
          app_id: string;
          app_link: string;
          private_key: string;
      };

export interface CreateIntegrationParams {
    environmentId: number;
    provider: string;
    uniqueKey: string;
    credentialSource: 'nango' | 'own';
    displayName?: string | undefined;
    forwardWebhooks?: boolean | undefined;
    credentials?: CreateIntegrationCredentials | undefined;
    integrationConfig?: Record<string, string> | undefined;
}

const nangoCredentialsAuthModes = new Set(['OAUTH1', 'OAUTH2']);
const credentialsRequiredAuthModes = new Set(['OAUTH1', 'OAUTH2', 'APP', 'CUSTOM']);

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

    async create(params: CreateIntegrationParams): Promise<Result<CreatedIntegration, IntegrationServiceError>> {
        try {
            const provider = getProvider(params.provider);
            if (!provider) {
                return Err(new IntegrationServiceError({ code: 'invalid_provider', message: 'Provider does not exist' }));
            }

            if (params.credentialSource === 'own') {
                if (params.credentials && params.credentials.type !== provider.auth_mode) {
                    return Err(
                        new IntegrationServiceError({
                            code: 'incompatible_credentials',
                            message: 'incompatible credentials auth type and provider auth'
                        })
                    );
                }
                if (!params.credentials && credentialsRequiredAuthModes.has(provider.auth_mode)) {
                    return Err(new IntegrationServiceError({ code: 'missing_credentials', message: 'Missing credentials' }));
                }
            } else if (!nangoCredentialsAuthModes.has(provider.auth_mode)) {
                return Err(
                    new IntegrationServiceError({
                        code: 'nango_credentials_unsupported',
                        message: 'Nango-provided credentials are unavailable for this provider'
                    })
                );
            }

            const exists = await configService.getProviderConfig(params.uniqueKey, params.environmentId);
            if (exists) {
                return Err(new IntegrationServiceError({ code: 'integration_exists', message: 'Integration already exists' }));
            }

            const integration: DBCreateIntegration = {
                environment_id: params.environmentId,
                provider: params.provider,
                display_name: params.displayName || null,
                unique_key: params.uniqueKey,
                custom: null,
                missing_fields: [],
                forward_webhooks: params.forwardWebhooks ?? true,
                shared_credentials_id: null
            };

            if (params.credentialSource === 'nango') {
                const sharedCredentials = await sharedCredentialsService.getLatestSharedCredentialsByName(params.provider);
                if (sharedCredentials.isErr()) {
                    return Err(
                        new IntegrationServiceError({
                            code: 'shared_credentials_load_failed',
                            message: 'Failed to load Nango-provided developer app',
                            cause: sharedCredentials.error
                        })
                    );
                }
                if (!sharedCredentials.value) {
                    return Err(
                        new IntegrationServiceError({
                            code: 'shared_credentials_not_found',
                            message: 'Nango-provided credentials are not configured for this provider'
                        })
                    );
                }
                integration.shared_credentials_id = sharedCredentials.value.id;
            } else {
                applyCredentials(integration, params.credentials);

                if (params.integrationConfig && Object.keys(params.integrationConfig).length > 0) {
                    const resolvedConfig = resolveIntegrationConfig(provider, params.integrationConfig);
                    if (resolvedConfig.isErr()) {
                        return Err(
                            new IntegrationServiceError({
                                code: 'invalid_integration_config',
                                message: resolvedConfig.error.message,
                                cause: resolvedConfig.error
                            })
                        );
                    }
                    integration.custom = { ...integration.custom, ...resolvedConfig.value };
                }
            }

            const created = await configService.createProviderConfig(integration, provider);
            if (!created) {
                return Err(new IntegrationServiceError({ code: 'create_failed', message: 'Failed to create integration' }));
            }

            return Ok({ integration: created, provider });
        } catch (err) {
            return Err(
                new IntegrationServiceError({
                    code: 'create_failed',
                    message: 'Failed to create integration',
                    cause: err
                })
            );
        }
    }
}

function applyCredentials(integration: DBCreateIntegration, credentials: CreateIntegrationCredentials | undefined): void {
    if (!credentials) {
        return;
    }

    switch (credentials.type) {
        case 'OAUTH1':
        case 'OAUTH2':
        case 'TBA': {
            integration.oauth_client_id = credentials.client_id;
            integration.oauth_client_secret = credentials.client_secret;
            integration.oauth_scopes = credentials.scopes;
            if (credentials.webhook_secret) {
                integration.custom = { webhookSecret: credentials.webhook_secret };
            }
            break;
        }

        case 'APP': {
            integration.oauth_client_id = credentials.app_id;
            integration.oauth_client_secret = Buffer.from(credentials.private_key).toString('base64');
            integration.app_link = credentials.app_link;
            break;
        }

        case 'CUSTOM': {
            integration.oauth_client_id = credentials.client_id;
            integration.oauth_client_secret = credentials.client_secret;
            integration.app_link = credentials.app_link;
            integration.custom = { app_id: credentials.app_id, private_key: Buffer.from(credentials.private_key).toString('base64') };
            break;
        }
    }
}

export default new IntegrationService();
