import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';
import type { DBConnection, GetConnection } from '@nangohq/types';
import { connectionService, configService, errorNotificationService } from '@nangohq/shared';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from '../../../../hooks/hooks.js';
import { logContextGetter } from '@nangohq/logs';
import { connectionIdSchema, envSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';
import { endUserToApi } from '../../../../formatters/endUser.js';
import { connectionFullToApi } from '../../../../formatters/connection.js';

const queryStringValidation = z
    .object({
        provider_config_key: providerConfigKeySchema,
        env: envSchema
    })
    .strict();

const paramValidation = z
    .object({
        connectionId: connectionIdSchema
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

    const queryParams: GetConnection['Querystring'] = queryParamValues.data;
    const params: GetConnection['Params'] = paramValue.data;

    const { provider_config_key: providerConfigKey } = queryParams;
    const { connectionId } = params;

    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({
            error: {
                code: 'unknown_provider_config',
                message: 'Provider config not found for the given provider config key. Please make sure the provider config exists in the Nango dashboard.'
            }
        });
        return;
    }

    const connectionRes = await connectionService.getConnectionForPrivateApi({ connectionId, providerConfigKey, environmentId: environment.id });
    if (connectionRes.isErr()) {
        res.status(404).send({ error: { code: 'not_found', message: 'Failed to find connection' } });
        return;
    }

    let connection = connectionRes.value.connection;
    const endUser = connectionRes.value.end_user;

    const credentialResponse = await connectionService.refreshOrTestCredentials({
        account,
        environment,
        connection,
        integration,
        logContextGetter,
        instantRefresh: false,
        onRefreshSuccess: connectionRefreshSuccessHook,
        onRefreshFailed: connectionRefreshFailedHook
    });

    if (credentialResponse.isOk()) {
        connection = credentialResponse.value;
    }
    const errorLog = await errorNotificationService.auth.get(connection.id!);

    res.status(200).send({
        data: {
            provider: integration.provider,
            connection: connectionFullToApi(connection as DBConnection),
            endUser: endUserToApi(endUser),
            errorLog
        }
    });
});
