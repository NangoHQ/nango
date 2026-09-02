import * as z from 'zod';

import { connectionService } from '@nangohq/shared';
import { metrics, zodErrorToHTTP } from '@nangohq/utils';

import { retrievedConnectionToPublicApi } from '../../../formatters/connection.js';
import { connectionIdSchema, providerConfigKeySchema } from '../../../helpers/validation.js';
import { connectionRefreshFailed, connectionRefreshSuccess } from '../../../hooks/hooks.js';
import { hasAuthorizedScope } from '../../../middleware/scope.middleware.js';
import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';

import type { RetrievedConnection } from '@nangohq/shared';
import type { ApiPublicConnectionFull, GetPublicConnection } from '@nangohq/types';

const queryStringValidation = z
    .object({
        provider_config_key: providerConfigKeySchema,
        refresh_token: z.stringbool().optional().default(false),
        force_refresh: z.stringbool().optional().default(false),
        refresh_github_app_jwt_token: z.stringbool().optional().default(false)
    })
    .strict();

const paramValidation = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

export const getPublicConnection = asyncWrapperWithEnvironment<GetPublicConnection>(async (req, res) => {
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
        refresh_github_app_jwt_token: refreshGithubAppJwtToken
    } = queryParams;
    const { connectionId } = params;

    const isSync = req.get('Nango-Is-Sync') === 'true';

    if (!isSync) {
        metrics.increment(metrics.Types.GET_CONNECTION, 1);
    }

    const includeCredentials = hasAuthorizedScope({ locals: res.locals, requiredScope: 'environment:connections:read_credentials' });
    const requestsCredentialOperation = returnRefreshToken || instantRefresh || refreshGithubAppJwtToken;
    if (!includeCredentials && requestsCredentialOperation) {
        res.status(403).send({
            error: {
                code: 'forbidden',
                message: 'Credential and refresh options require the environment:connections:read_credentials scope'
            }
        });
        return;
    }

    const result = includeCredentials
        ? await connectionService.getConnectionWithCredentials({
              account,
              environment,
              connectionId,
              integrationId: providerConfigKey,
              onRefreshFailed: connectionRefreshFailed,
              onRefreshSuccess: connectionRefreshSuccess,
              forceRefresh: instantRefresh ?? false,
              returnRefreshToken: returnRefreshToken ?? false,
              refreshGithubAppJwtToken: refreshGithubAppJwtToken ?? false
          })
        : await connectionService.getConnectionWithoutCredentials({
              environmentId: environment.id,
              connectionId,
              integrationId: providerConfigKey
          });

    if (result.isErr()) {
        const error = result.error;
        if (error.code === 'unknown_provider_config' || error.code === 'not_found') {
            res.status(error.status).send({ error: { code: error.code, message: error.message } });
            return;
        }
        if (error.code === 'invalid_credentials') {
            res.status(error.status).send({
                error: {
                    code: 'invalid_credentials',
                    message: error.message,
                    payload: {
                        ...error.payload,
                        ...(error.connection ? { connection: retrievedConnectionResultToPublicApi(error.connection, includeCredentials) } : {})
                    }
                }
            });
            return;
        }
        res.status(500).send({ error: { code: 'server_error', message: error.message } });
        return;
    }

    res.status(200).send(retrievedConnectionResultToPublicApi(result.value, includeCredentials));
});

function retrievedConnectionResultToPublicApi(connection: RetrievedConnection, includeCredentials: boolean): ApiPublicConnectionFull {
    return retrievedConnectionToPublicApi({
        data: connection.connection,
        credentials: connection.credentials,
        activeLog: connection.activeLogs,
        endUser: connection.endUser,
        provider: connection.provider,
        includeCredentials
    });
}
