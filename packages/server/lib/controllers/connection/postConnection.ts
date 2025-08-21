import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, encryptionManager, getProvider, githubAppClient } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionFullToPublicApi } from '../../formatters/connection.js';
import {
    connectionCredentialsBasicSchema,
    connectionCredentialsGithubAppSchema,
    connectionCredentialsOauth1Schema,
    connectionCredentialsOauth2CCSchema,
    connectionCredentialsOauth2Schema,
    connectionCredentialsTBASchema
} from '../../helpers/validation.js';
import { connectionCreated, connectionCreationStartCapCheck, connectionRefreshSuccess } from '../../hooks/hooks.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { AuthOperationType, ConnectionConfig, ConnectionUpsertResponse, PostPublicConnection, ProviderGithubApp } from '@nangohq/types';

const schemaBody = z.object({
    provider_config_key: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    connection_config: z
        .looseObject({
            oauth_scopes_override: z.string().array().optional()
        })
        .optional(),
    connection_id: z.string().optional(),
    credentials: z.discriminatedUnion('type', [
        z
            .strictObject({
                type: z.literal('OAUTH2')
            })
            .extend(connectionCredentialsOauth2Schema.shape),
        z
            .strictObject({
                type: z.literal('OAUTH2_CC')
            })
            .extend(connectionCredentialsOauth2CCSchema.shape),
        z
            .strictObject({
                type: z.literal('OAUTH1')
            })
            .extend(connectionCredentialsOauth1Schema.shape),
        z
            .strictObject({
                type: z.literal('BASIC')
            })
            .extend(connectionCredentialsBasicSchema.shape),
        z
            .strictObject({
                type: z.literal('NONE')
            })
            .strict(),
        z
            .strictObject({
                type: z.literal('TBA')
            })
            .extend(connectionCredentialsTBASchema.shape),
        z
            .strictObject({
                type: z.literal('APP')
            })
            .extend(connectionCredentialsGithubAppSchema.shape)
    ])
});

export const postPublicConnection = asyncWrapper<PostPublicConnection>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = schemaBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment, account, plan } = res.locals;
    const body: PostPublicConnection['Body'] = req.body;

    const integration = await configService.getProviderConfig(body.provider_config_key, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const providerName = integration.provider;

    if (plan) {
        const isCapped = await connectionCreationStartCapCheck({
            creationType: 'import',
            team: account,
            plan
        });
        if (isCapped.capped) {
            res.status(400).send({
                error: { code: 'resource_capped', message: 'Reached maximum number of allowed connections. Upgrade your plan to get rid of connection limits.' }
            });
            return;
        }
    }

    const provider = getProvider(providerName);
    if (!provider) {
        res.status(404).send({ error: { code: 'not_found', message: 'Provider does not exist' } });
        return;
    }

    if (provider.auth_mode !== body.credentials.type) {
        res.status(400).send({ error: { code: 'invalid_body', message: `Provider ${provider.auth_mode} does not support ${body.credentials.type} auth` } });
        return;
    }

    let updatedConnection: ConnectionUpsertResponse | undefined;

    const connCreatedHook = (res: ConnectionUpsertResponse) => {
        void connectionCreated(
            {
                connection: res.connection,
                environment,
                account,
                auth_mode: provider.auth_mode,
                operation: res.operation as unknown as AuthOperationType,
                endUser: undefined
            },
            account,
            integration,
            logContextGetter
        );
    };

    const connectionId = body.connection_id ?? connectionService.generateConnectionId();

    switch (body.credentials.type) {
        case 'OAUTH2':
        case 'OAUTH2_CC':
        case 'OAUTH1': {
            const [imported] = await connectionService.importOAuthConnection({
                connectionId,
                providerConfigKey: body.provider_config_key,
                metadata: body.metadata || {},
                environment,
                connectionConfig: body.connection_config || {},
                parsedRawCredentials: { ...body.credentials, raw: body.credentials },
                connectionCreatedHook: connCreatedHook
            });

            if (imported) {
                updatedConnection = imported;
            }

            break;
        }
        case 'API_KEY':
        case 'BASIC': {
            const [imported] = await connectionService.importApiAuthConnection({
                connectionId,
                providerConfigKey: body.provider_config_key,
                metadata: body.metadata || {},
                environment,
                credentials: body.credentials,
                connectionConfig: body.connection_config || {},
                connectionCreatedHook: connCreatedHook
            });

            if (imported) {
                updatedConnection = imported;
            }
            break;
        }
        case 'APP': {
            const connectionConfig: ConnectionConfig = {
                app_id: body.credentials.app_id,
                installation_id: body.credentials.installation_id
            };

            const credentialsRes = await githubAppClient.createCredentials({
                provider: provider as ProviderGithubApp,
                integration,
                connectionConfig
            });
            if (credentialsRes.isErr()) {
                res.status(500).send({ error: { code: 'server_error', message: credentialsRes.error.message } });
                return;
            }

            const [imported] = await connectionService.upsertConnection({
                connectionId,
                providerConfigKey: body.provider_config_key,
                parsedRawCredentials: credentialsRes.value,
                connectionConfig: body.connection_config || {},
                environmentId: environment.id,
                metadata: body.metadata || {}
            });

            if (imported) {
                updatedConnection = imported;
                connCreatedHook(updatedConnection);
            }
            break;
        }
        case 'TBA': {
            if (!body.connection_config || !body.connection_config['accountId']) {
                res.status(400).send({
                    error: { code: 'invalid_body', message: 'Missing accountId in connection_config. This is required to create a TBA connection.' }
                });

                return;
            }

            const [imported] = await connectionService.upsertAuthConnection({
                connectionId,
                providerConfigKey: body.provider_config_key,
                credentials: body.credentials,
                connectionConfig: {
                    ...body.connection_config,
                    oauth_client_id: integration.oauth_client_id,
                    oauth_client_secret: integration.oauth_client_secret
                },
                metadata: body.metadata || {},
                config: integration,
                environment
            });

            if (imported) {
                updatedConnection = imported;
                connCreatedHook(updatedConnection);
            }
            break;
        }
        case 'NONE': {
            const [imported] = await connectionService.upsertUnauthConnection({
                connectionId,
                providerConfigKey: body.provider_config_key,
                environment,
                metadata: body.metadata || {},
                connectionConfig: body.connection_config || {}
            });

            if (imported) {
                updatedConnection = imported;
                connCreatedHook(updatedConnection);
            }
            break;
        }
        default:
            // Missing Bill, Signature, JWT, TwoStep, AppStore
            res.status(400).send({ error: { code: 'invalid_body', message: `Unsupported auth type ${provider.auth_mode}` } });
            return;
    }

    if (updatedConnection && updatedConnection.operation === 'override') {
        // If we updated the connection we assume the connection is now correct
        await connectionRefreshSuccess({ connection: updatedConnection.connection, config: integration });
    }

    if (!updatedConnection) {
        res.status(500).send({ error: { code: 'server_error', message: `Failed to create connection` } });
        return;
    }

    const connection = encryptionManager.decryptConnection(updatedConnection.connection);

    res.status(201).send(connectionFullToPublicApi({ data: connection, provider: providerName, activeLog: [], endUser: null }));
});
