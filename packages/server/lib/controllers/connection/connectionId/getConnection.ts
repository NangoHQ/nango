import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { metrics, zodErrorToHTTP } from '@nangohq/utils';
import type { GetPublicConnection } from '@nangohq/types';
import { connectionService, configService } from '@nangohq/shared';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from '../../../hooks/hooks.js';
import { logContextGetter } from '@nangohq/logs';
import { connectionIdSchema, providerConfigKeySchema, stringBool } from '../../../helpers/validation.js';
import { connectionFullToPublicApi } from '../../../formatters/connection.js';

const queryStringValidation = z
    .object({
        provider_config_key: providerConfigKeySchema,
        refresh_token: stringBool.optional(),
        force_refresh: stringBool.optional()
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

    const { provider_config_key: providerConfigKey, force_refresh: instantRefresh, refresh_token: returnRefreshToken } = queryParams;
    const { connectionId } = params;

    const isSync = req.headers['Nango-Is-Sync'] === 'true';

    if (!isSync) {
        metrics.increment(metrics.Types.GET_CONNECTION, 1, { accountId: account.id });
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

    const credentialResponse = await connectionService.refreshOrTestCredentials({
        account,
        environment,
        connection: connectionRes.response,
        integration,
        logContextGetter,
        instantRefresh: instantRefresh ?? false,
        onRefreshSuccess: connectionRefreshSuccessHook,
        onRefreshFailed: connectionRefreshFailedHook
    });
    if (credentialResponse.isErr()) {
        res.status(credentialResponse.error.status).send({
            error: { code: 'server_error', message: credentialResponse.error.message || 'Failed to refresh or test credentials' }
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

    // We get connection one last time to get endUser, errors
    // This is very unoptimized unfortunately
    const finalConnections = await connectionService.listConnections({ environmentId: environment.id, connectionId, integrationIds: [providerConfigKey] });
    if (finalConnections.length !== 1 || !finalConnections[0]) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get connection' } });
        return;
    }

    res.status(200).send(
        connectionFullToPublicApi({
            data: { ...finalConnections[0].connection, credentials: connection.credentials },
            activeLog: finalConnections[0].active_logs,
            endUser: finalConnections[0].end_user,
            provider: finalConnections[0].provider
        })
    );
});
