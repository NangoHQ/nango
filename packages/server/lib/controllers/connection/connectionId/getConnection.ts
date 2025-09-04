import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, refreshOrTestCredentials } from '@nangohq/shared';
import { Err, Ok, metrics, zodErrorToHTTP } from '@nangohq/utils';

import { connectionFullToPublicApi } from '../../../formatters/connection.js';
import { connectionIdSchema, providerConfigKeySchema } from '../../../helpers/validation.js';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from '../../../hooks/hooks.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { AllAuthCredentials, ApiPublicConnectionFull, GetPublicConnection, Result } from '@nangohq/types';

const queryStringValidation = z
    .object({
        provider_config_key: providerConfigKeySchema,
        refresh_token: z.stringbool().optional().default(false),
        force_refresh: z.stringbool().optional().default(false),
        token_name: z.string().optional()
    })
    .strict();

const paramValidation = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

export const getPublicConnection = asyncWrapper<GetPublicConnection>(async (req, res) => {
    const queryParamValues = queryStringValidation.safeParse(req.query);
    if (!queryParamValues.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) } });
        return;
    }

    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) } });
        return;
    }

    const { environment, account } = res.locals;

    const queryParams: GetPublicConnection['Querystring'] = queryParamValues.data;
    const params: GetPublicConnection['Params'] = paramValue.data;

    const {
        provider_config_key: providerConfigKey,
        force_refresh: instantRefresh,
        refresh_token: returnRefreshToken,
        token_name: specifiedTokenName
    } = queryParams;
    const { connectionId } = params;

    const isSync = req.headers['Nango-Is-Sync'] === 'true';

    if (!isSync) {
        metrics.increment(metrics.Types.GET_CONNECTION, 1);
    }

    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(400).send({ error: { code: 'unknown_provider_config', message: 'Provider does not exists' } });
        return;
    }

    const connectionRes = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
    if (connectionRes.error || !connectionRes.response) {
        res.status(404).send({ error: { code: 'not_found', message: 'Failed to find connection' } });
        return;
    }

    const getApiPublicConnection = async (credentials: AllAuthCredentials = {}): Promise<Result<ApiPublicConnectionFull>> => {
        // We are using listConnections because it has everything we need, but this is a bit wrong
        const finalConnections = await connectionService.listConnections({ environmentId: environment.id, connectionId, integrationIds: [providerConfigKey] });
        if (finalConnections.length !== 1 || !finalConnections[0]) {
            return Err('Failed to get connection');
        }

        return Ok(
            connectionFullToPublicApi({
                data: {
                    ...finalConnections[0].connection,
                    credentials
                },
                activeLog: finalConnections[0].active_logs,
                endUser: finalConnections[0].end_user,
                provider: finalConnections[0].provider
            })
        );
    };

    const credentialResponse = await refreshOrTestCredentials({
        account,
        environment,
        connection: connectionRes.response,
        integration,
        logContextGetter,
        instantRefresh: instantRefresh ?? false,
        onRefreshSuccess: connectionRefreshSuccessHook,
        onRefreshFailed: connectionRefreshFailedHook,
        specifiedTokenName
    });
    if (credentialResponse.isErr()) {
        const { connection, ...payload } = credentialResponse.error.payload || {};
        const apiPublicConnection = await getApiPublicConnection();
        res.status(credentialResponse.error.status).send({
            error: {
                code: 'invalid_credentials',
                message: credentialResponse.error.message || 'Failed to refresh or test credentials',
                payload: {
                    ...payload,
                    ...(apiPublicConnection.isOk() ? { connection: apiPublicConnection.value } : {})
                }
            }
        });
        return;
    }

    const { value: connection } = credentialResponse;

    if (connection && connection.credentials && connection.credentials.type === 'OAUTH2' && !returnRefreshToken) {
        if (connection.credentials.refresh_token) {
            delete connection.credentials.refresh_token;
        }

        if (connection.credentials.raw && connection.credentials.raw['refresh_token']) {
            const rawCreds = { ...connection.credentials.raw }; // Properties from 'raw' are not mutable so we need to create a new object.

            const { refresh_token, ...rest } = rawCreds;
            connection.credentials.raw = rest;
        }
    }

    const response = await getApiPublicConnection(connection.credentials);
    if (response.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: response.error.message } });
        return;
    }

    res.status(200).send(response.value);
});
