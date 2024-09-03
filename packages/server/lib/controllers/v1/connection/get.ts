import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';
import type { Connection, GetConnection, IntegrationConfig } from '@nangohq/types';
import { connectionService, configService, errorNotificationService } from '@nangohq/shared';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from '../../../hooks/hooks.js';
import { logContextGetter } from '@nangohq/logs';

const queryStringValidation = z
    .object({
        provider_config_key: z.string().min(1),
        force_refresh: z.union([z.literal('true'), z.literal('false')]).optional(),
        env: z.string().max(250).min(1)
    })
    .strict();

const paramValidation = z
    .object({
        connectionId: z.string().min(1)
    })
    .strict();

export const getConnection = asyncWrapper<GetConnection>(async (req, res) => {
    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const queryParamValues = queryStringValidation.safeParse(req.query);

    if (!queryParamValues.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) }
        });
        return;
    }

    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) }
        });
        return;
    }

    const { environment, account } = res.locals;

    const queryParams = queryParamValues.data;
    const params = paramValue.data;

    const { provider_config_key: providerConfigKey, force_refresh } = queryParams;
    const instantRefresh = force_refresh === 'true';
    const { connectionId } = params;

    const credentialResponse = await connectionService.getConnectionCredentials({
        account,
        environment,
        connectionId,
        providerConfigKey,
        logContextGetter,
        instantRefresh,
        onRefreshSuccess: connectionRefreshSuccessHook,
        onRefreshFailed: connectionRefreshFailedHook
    });

    if (credentialResponse.isErr()) {
        if (credentialResponse.error.payload && credentialResponse.error.payload['id']) {
            const errorConnection = credentialResponse.error.payload as unknown as Connection;
            const errorLog = await errorNotificationService.auth.get(errorConnection.id as number);

            res.status(400).send({
                errorLog,
                provider: null,
                connection: errorConnection
            });
        } else {
            switch (credentialResponse.error.type) {
                case 'missing_connection':
                    res.status(400).send({
                        error: {
                            code: 'missing_connection',
                            message: credentialResponse.error.message
                        }
                    });
                    break;
                case 'missing_provider_config':
                    res.status(400).send({
                        error: {
                            code: 'missing_provider_config',
                            message: credentialResponse.error.message
                        }
                    });
                    break;
                case 'unknown_connection':
                    res.status(404).send({
                        error: {
                            code: 'unknown_connection',
                            message: credentialResponse.error.message
                        }
                    });
                    break;
                case 'unknown_provider_config':
                    res.status(404).send({
                        error: {
                            code: 'unknown_provider_config',
                            message: credentialResponse.error.message
                        }
                    });
                    break;
            }
        }
        return;
    }

    const { value: connection } = credentialResponse;

    const config: IntegrationConfig | null = await configService.getProviderConfig(connection.provider_config_key, environment.id);

    if (!config) {
        res.status(404).send({
            error: {
                code: 'unknown_provider_config',
                message: 'Provider config not found for the given provider config key. Please make sure the provider config exists in the Nango dashboard.'
            }
        });
        return;
    }

    if (instantRefresh) {
        const logCtx = await logContextGetter.create(
            { operation: { type: 'auth', action: 'refresh_token' } },
            {
                account,
                environment,
                integration: { id: config.id!, name: config.unique_key, provider: config.provider },
                connection: { id: connection.id!, name: connection.connection_id }
            }
        );
        await logCtx.info(`Token manual refresh fetch was successful for ${providerConfigKey} and connection ${connectionId} from the web UI`);
        await logCtx.success();
    }

    res.status(200).send({
        provider: config.provider,
        connection,
        errorLog: null
    });
});
