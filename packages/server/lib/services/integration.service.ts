import db from '@nangohq/database';
import { configService, connectionService, getGlobalWebhookReceiveUrl, getProvider, getProviders, sharedCredentialsService } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { getIntegrationCredentials } from '../utils/integrations.js';
import { resolveIntegrationConfig } from './integrationConfig.js';

import type { IntegrationCredentials } from '../utils/integrations.js';
import type { DBCreateIntegration, IntegrationConfig, Provider } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type GetIntegrationServiceErrorCode = 'get_failed' | 'not_found';
export type ListIntegrationsServiceErrorCode = 'list_failed';
export type CreateIntegrationServiceErrorCode =
    | 'invalid_provider'
    | 'incompatible_credentials'
    | 'missing_credentials'
    | 'nango_credentials_unsupported'
    | 'integration_exists'
    | 'shared_credentials_load_failed'
    | 'shared_credentials_not_found'
    | 'invalid_integration_config'
    | 'create_failed';
export type UpdateIntegrationsServiceErrorCode =
    | 'not_found'
    | 'incompatible_credentials'
    | 'integration_exists'
    | 'invalid_integration_config'
    | 'integration_has_connections'
    | 'custom_not_allowed'
    | 'update_failed';
export type IntegrationServiceErrorCode =
    | GetIntegrationServiceErrorCode
    | ListIntegrationsServiceErrorCode
    | CreateIntegrationServiceErrorCode
    | UpdateIntegrationsServiceErrorCode;

export class IntegrationServiceError<TCode extends IntegrationServiceErrorCode = IntegrationServiceErrorCode> extends Error {
    public code: TCode;

    constructor({ code, message, cause }: { code: TCode; message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'IntegrationServiceError';
        this.code = code;
    }
}

export type GetIntegrationServiceError = IntegrationServiceError<GetIntegrationServiceErrorCode>;
export type ListIntegrationsServiceError = IntegrationServiceError<ListIntegrationsServiceErrorCode>;
export type CreateIntegrationServiceError = IntegrationServiceError<CreateIntegrationServiceErrorCode>;
export type UpdateIntegrationsServiceError = IntegrationServiceError<UpdateIntegrationsServiceErrorCode>;

export interface ListedIntegration {
    integration: IntegrationConfig;
    provider: Provider;
}

export interface RetrievedIntegration extends ListedIntegration {
    webhookUrl?: string | null;
    credentials?: IntegrationCredentials;
}

export type CreatedIntegration = ListedIntegration;
export type UpdatedIntegration = ListedIntegration;

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
    custom?: Record<string, string> | undefined;
}

export interface UpdateIntegrationParams {
    environmentId: number;
    integrationId: string;
    newIntegrationId?: string | undefined;
    displayName?: string | undefined;
    credentials?: CreateIntegrationCredentials | undefined;
    forwardWebhooks?: boolean | undefined;
    integrationConfig?: Record<string, string> | undefined;
    custom?: Record<string, string> | undefined;
}

const nangoCredentialsAuthModes = new Set(['OAUTH1', 'OAUTH2']);
const credentialsRequiredAuthModes = new Set(['OAUTH1', 'OAUTH2', 'APP', 'CUSTOM']);
const machineErrorCodePattern = /^(?:E[A-Z0-9_]{2,63}|[0-9A-Z]{5})$/;
const defaultLogger = getLogger('Server.IntegrationService');

interface IntegrationServiceLogger {
    error(message: string, metadata?: Record<string, unknown>): void;
}

export class IntegrationService {
    constructor(private readonly logger: IntegrationServiceLogger = defaultLogger) {}

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
    }): Promise<Result<RetrievedIntegration, GetIntegrationServiceError>> {
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
    }): Promise<Result<ListedIntegration[], ListIntegrationsServiceError>> {
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

    async create(params: CreateIntegrationParams): Promise<Result<CreatedIntegration, CreateIntegrationServiceError>> {
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
                    this.logCreateFailure('shared_credentials_load_failed', sharedCredentials.error);
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

                if (params.custom && Object.keys(params.custom).length > 0) {
                    if (provider.integration_config) {
                        return Err(
                            new IntegrationServiceError({
                                code: 'invalid_integration_config',
                                message: 'This provider uses integration_config; set its values there instead of custom'
                            })
                        );
                    }
                    integration.custom = { ...integration.custom, ...params.custom };
                }
            }

            const created = await configService.createProviderConfig(integration, provider);
            if (!created) {
                this.logger.error('Integration creation failed', {
                    failureCode: 'create_failed',
                    errorKind: 'empty_result'
                });
                return Err(new IntegrationServiceError({ code: 'create_failed', message: 'Failed to create integration' }));
            }

            return Ok({ integration: created, provider });
        } catch (err) {
            this.logCreateFailure('create_failed', err);
            return Err(
                new IntegrationServiceError({
                    code: 'create_failed',
                    message: 'Failed to create integration',
                    cause: err
                })
            );
        }
    }

    async update(params: UpdateIntegrationParams): Promise<Result<UpdatedIntegration, UpdateIntegrationsServiceError>> {
        try {
            const integration = await configService.getProviderConfig(params.integrationId, params.environmentId);
            if (!integration) {
                return Err(
                    new IntegrationServiceError({
                        code: 'not_found',
                        message: `Integration "${params.integrationId}" does not exist`
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

            if (params.credentials && params.credentials.type !== provider.auth_mode) {
                return Err(
                    new IntegrationServiceError({
                        code: 'incompatible_credentials',
                        message: 'incompatible credentials auth type and provider auth'
                    })
                );
            }

            if (params.newIntegrationId && params.newIntegrationId !== integration.unique_key) {
                const existingId = await configService.getIdByProviderConfigKey(params.environmentId, params.newIntegrationId);
                if (existingId && existingId !== integration.id) {
                    return Err(new IntegrationServiceError({ code: 'integration_exists', message: 'Integration ID already exists' }));
                }

                const connectionCount = await connectionService.countConnections({
                    environmentId: params.environmentId,
                    providerConfigKey: params.integrationId
                });
                if (connectionCount > 0) {
                    return Err(
                        new IntegrationServiceError({
                            code: 'integration_has_connections',
                            message: "Can't rename an integration with active connections"
                        })
                    );
                }

                integration.unique_key = params.newIntegrationId;
            }

            if (params.displayName !== undefined) {
                integration.display_name = params.displayName;
            }
            if (params.forwardWebhooks !== undefined) {
                integration.forward_webhooks = params.forwardWebhooks;
            }

            if (params.integrationConfig && Object.keys(params.integrationConfig).length > 0) {
                const resolvedConfig = resolveIntegrationConfig(provider, params.integrationConfig, { patch: true, existing: integration.custom });
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

            if (params.custom && Object.keys(params.custom).length > 0) {
                if (provider.integration_config) {
                    return Err(
                        new IntegrationServiceError({
                            code: 'custom_not_allowed',
                            message: 'This provider uses integration_config; set its values there instead of custom'
                        })
                    );
                }
                integration.custom = { ...integration.custom, ...params.custom };
            }

            applyCredentials(integration, params.credentials);
            if (params.credentials?.type === 'OAUTH2' && 'webhook_secret' in params.credentials) {
                if (params.credentials.webhook_secret) {
                    integration.custom = { ...integration.custom, webhookSecret: params.credentials.webhook_secret };
                } else {
                    delete integration.custom?.['webhookSecret'];
                }
            }

            const updated = await configService.editProviderConfig(integration, provider);
            return Ok({ integration: updated, provider });
        } catch (err) {
            this.logger.error('Integration update failed', {
                failureCode: 'update_failed',
                errorKind: err instanceof Error ? 'exception' : 'non_error',
                ...getSafeMachineErrorCode(err)
            });
            return Err(
                new IntegrationServiceError({
                    code: 'update_failed',
                    message: 'Failed to update integration',
                    cause: err
                })
            );
        }
    }

    private logCreateFailure(failureCode: 'shared_credentials_load_failed' | 'create_failed', error: unknown): void {
        this.logger.error('Integration creation failed', {
            failureCode,
            errorKind: error instanceof Error ? 'exception' : 'non_error',
            ...getSafeMachineErrorCode(error)
        });
    }
}

function getSafeMachineErrorCode(error: unknown): { machineErrorCode?: string } {
    const seen = new Set<object>();
    let current = error;

    while (typeof current === 'object' && current !== null && !seen.has(current)) {
        seen.add(current);
        const errorWithMetadata = current as { code?: unknown; cause?: unknown };
        if (typeof errorWithMetadata.code === 'string' && machineErrorCodePattern.test(errorWithMetadata.code)) {
            return { machineErrorCode: errorWithMetadata.code };
        }
        current = errorWithMetadata.cause;
    }

    return {};
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
                integration.custom = { ...integration.custom, webhookSecret: credentials.webhook_secret };
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
            integration.custom = {
                ...integration.custom,
                app_id: credentials.app_id,
                private_key: Buffer.from(credentials.private_key).toString('base64')
            };
            break;
        }
    }
}

export default new IntegrationService();
