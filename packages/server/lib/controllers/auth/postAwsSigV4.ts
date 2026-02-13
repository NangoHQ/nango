import { v4 as uuidv4 } from 'uuid';
import * as z from 'zod';

import db from '@nangohq/database';
import { defaultOperationExpiration, endUserToMeta, logContextGetter } from '@nangohq/logs';
import {
    ErrorSourceEnum,
    LogActionEnum,
    NangoError,
    ProxyRequest,
    awsSigV4Client,
    configService,
    connectionService,
    errorManager,
    getConnectionConfig,
    getProvider,
    getProxyConfiguration,
    syncEndUserToConnection
} from '@nangohq/shared';
import { metrics, zodErrorToHTTP } from '@nangohq/utils';

import { connectionCredential, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { validateConnection } from '../../hooks/connection/on/validate-connection.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../../hooks/hooks.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { errorRestrictConnectionId, isIntegrationAllowed } from '../../utils/auth.js';
import { hmacCheck } from '../../utils/hmac.js';

import type { LogContext } from '@nangohq/logs';
import type { Config as ProviderConfig } from '@nangohq/shared';
import type { AwsSigV4Credentials, PostPublicAwsSigV4Authorization } from '@nangohq/types';
import type { NextFunction } from 'express';

const bodyValidation = z
    .object({
        role_arn: z.string().min(1),
        region: z.string().min(1).optional()
    })
    .strict();

const queryValidation = z
    .object({
        connection_id: connectionIdSchema.optional(),
        params: z.record(z.string(), z.any()).optional(),
        user_scope: z.string().optional()
    })
    .and(connectionCredential);

const paramsValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const postPublicAwsSigV4Authorization = asyncWrapper<PostPublicAwsSigV4Authorization>(async (req, res, next: NextFunction) => {
    const valBody = bodyValidation.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const valQuery = queryValidation.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const valParams = paramsValidation.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { account, environment, connectSession } = res.locals;
    const body: PostPublicAwsSigV4Authorization['Body'] = valBody.data;
    const query: PostPublicAwsSigV4Authorization['Querystring'] = valQuery.data;
    const { providerConfigKey } = valParams.data;

    let connectionId = query.connection_id || connectionService.generateConnectionId();
    const connectionConfig = query.params ? getConnectionConfig(query.params) : {};
    const hmac = 'hmac' in query ? query.hmac : undefined;
    const isConnectSession = res.locals['authType'] === 'connectSession';

    if (isConnectSession && query.connection_id) {
        errorRestrictConnectionId(res);
        return;
    }

    let logCtx: LogContext | undefined;
    let config: ProviderConfig | null = null;

    try {
        logCtx =
            isConnectSession && connectSession.operationId
                ? logContextGetter.get({ id: connectSession.operationId, accountId: account.id })
                : await logContextGetter.create(
                      {
                          operation: { type: 'auth', action: 'create_connection' },
                          meta: { authType: 'aws_sigv4', connectSession: endUserToMeta(res.locals.endUser) },
                          expiresAt: defaultOperationExpiration.auth()
                      },
                      { account, environment }
                  );

        if (!isConnectSession) {
            const checked = await hmacCheck({ environment, logCtx, providerConfigKey, connectionId, hmac, res });
            if (!checked) {
                return;
            }
        }

        config = await configService.getProviderConfig(providerConfigKey, environment.id);
        if (!config) {
            void logCtx.error('Unknown provider config');
            await logCtx.failed();
            res.status(404).send({ error: { code: 'unknown_provider_config' } });
            return;
        }

        const provider = getProvider(config.provider);
        if (!provider) {
            void logCtx.error('Unknown provider');
            await logCtx.failed();
            res.status(404).send({ error: { code: 'unknown_provider_template' } });
            return;
        }

        if (provider.auth_mode !== 'AWS_SIGV4') {
            void logCtx.error('Provider does not support AWS_SIGV4 auth', { provider: config.provider });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_auth_mode' } });
            return;
        }

        if (!(await isIntegrationAllowed({ config, res, logCtx }))) {
            return;
        }

        if (isConnectSession && connectSession.connectionId) {
            const existing = await connectionService.getConnectionById(connectSession.connectionId);
            if (!existing) {
                void logCtx.error('Invalid connection');
                await logCtx.failed();
                res.status(400).send({ error: { code: 'invalid_connection' } });
                return;
            }
            connectionId = existing.connection_id;
        }

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        const settingsResult = awsSigV4Client.getAwsSigV4Settings(config);
        if (settingsResult.isErr()) {
            void logCtx.error('Missing AWS SigV4 settings', { error: settingsResult.error });
            await logCtx.failed();
            errorManager.errResFromNangoErr(res, settingsResult.error);
            return;
        }
        const settings = settingsResult.value;

        const resolvedRegion = body.region || (connectionConfig['region'] as string) || settings.defaultRegion;
        if (!resolvedRegion) {
            const err = new NangoError('missing_aws_sigv4_region');
            errorManager.errResFromNangoErr(res, err);
            await logCtx.failed();
            return;
        }

        // Always generate ExternalId server-side; reuse stored value on reconnection
        let externalId: string;
        if (isConnectSession && connectSession.connectionId) {
            const existingConn = await connectionService.getConnectionById(connectSession.connectionId);
            externalId = (existingConn?.connection_config?.['external_id'] as string) || uuidv4();
        } else {
            externalId = uuidv4();
        }
        connectionConfig['external_id'] = externalId;
        connectionConfig['role_arn'] = body.role_arn;
        connectionConfig['region'] = resolvedRegion;
        connectionConfig['service'] = settings.service;

        const credsResult = await awsSigV4Client.fetchAwsTemporaryCredentials({
            settings,
            input: { roleArn: body.role_arn, externalId, region: resolvedRegion }
        });
        if (credsResult.isErr()) {
            void logCtx.error('Failed to retrieve AWS temp credentials', { error: credsResult.error });
            await logCtx.failed();
            errorManager.errResFromNangoErr(res, credsResult.error);
            return;
        }
        const tempCreds = credsResult.value;

        const credentials: AwsSigV4Credentials = {
            type: 'AWS_SIGV4',
            raw: {
                access_key_id: tempCreds.accessKeyId,
                secret_access_key: tempCreds.secretAccessKey,
                session_token: tempCreds.sessionToken,
                expires_at: tempCreds.expiresAt
            },
            role_arn: body.role_arn,
            region: resolvedRegion,
            service: settings.service,
            access_key_id: tempCreds.accessKeyId,
            secret_access_key: tempCreds.secretAccessKey,
            session_token: tempCreds.sessionToken,
            expires_at: tempCreds.expiresAt,
            external_id: externalId
        };

        await verifyAwsCredentials({
            provider: config.provider,
            providerConfigKey,
            credentials,
            connection_id: connectionId,
            connection_config: connectionConfig,
            logCtx
        });

        const [storedConnection] = await connectionService.upsertAuthConnection({
            connectionId,
            providerConfigKey,
            credentials,
            connectionConfig,
            metadata: {},
            config,
            environment
        });

        if (!storedConnection) {
            res.status(500).send({ error: { code: 'server_error', message: 'failed to create connection' } });
            void logCtx.error('Failed to create connection');
            await logCtx.failed();
            return;
        }

        const customValidationResponse = await validateConnection({
            connection: storedConnection.connection,
            config,
            account,
            logCtx
        });
        if (customValidationResponse.isErr()) {
            void logCtx.error('Connection failed custom validation', { error: customValidationResponse.error });
            await logCtx.failed();
            if (storedConnection.operation === 'creation') {
                await connectionService.hardDelete(storedConnection.connection.id);
            }
            const payload = customValidationResponse.error?.payload;
            const message = typeof payload['message'] === 'string' ? payload['message'] : 'Connection failed validation';
            res.status(400).send({ error: { code: 'connection_validation_failed', message } });
            return;
        }

        if (isConnectSession) {
            await syncEndUserToConnection(db.knex, { connectSession, connection: storedConnection.connection, account, environment });
        }

        await logCtx.enrichOperation({ connectionId: storedConnection.connection.id, connectionName: storedConnection.connection.connection_id });
        void logCtx.info('AWS SigV4 connection creation was successful');
        await logCtx.success();

        void connectionCreatedHook(
            {
                connection: storedConnection.connection,
                environment,
                account,
                auth_mode: 'AWS_SIGV4',
                operation: storedConnection.operation,
                endUser: res.locals.endUser
            },
            account,
            config,
            logContextGetter
        );

        metrics.increment(metrics.Types.AUTH_SUCCESS, 1, { auth_mode: 'AWS_SIGV4', provider: config.provider });
        res.status(200).send({ connectionId, providerConfigKey });
    } catch (err) {
        void connectionCreationFailedHook(
            {
                connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                environment,
                account,
                auth_mode: 'AWS_SIGV4',
                error: { type: 'server_error', description: 'Error creating AWS SigV4 connection' },
                operation: 'creation'
            },
            account,
            config ?? undefined
        );
        errorManager.report(err, {
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.AUTH,
            environmentId: environment.id,
            metadata: { providerConfigKey, connectionId }
        });
        if (logCtx) {
            void logCtx.error('uncaught error', { error: err });
            await logCtx.failed();
        }
        metrics.increment(metrics.Types.AUTH_FAILURE, 1, { auth_mode: 'AWS_SIGV4', ...(config ? { provider: config.provider } : {}) });
        next(err);
    }
});

async function verifyAwsCredentials({
    provider,
    providerConfigKey,
    credentials,
    connection_id,
    connection_config,
    logCtx
}: {
    provider: string;
    providerConfigKey: string;
    credentials: AwsSigV4Credentials;
    connection_id: string;
    connection_config: Record<string, any>;
    logCtx: LogContext;
}) {
    const verificationRegion = credentials.region || (connection_config['region'] as string) || null;
    if (!verificationRegion) {
        throw new NangoError('missing_aws_sigv4_region');
    }

    const credentialsForVerification: AwsSigV4Credentials = {
        ...credentials,
        region: verificationRegion,
        service: 'sts'
    };
    const stsBaseUrl = `https://sts.${verificationRegion}.amazonaws.com`;

    const proxyConfigResult = getProxyConfiguration({
        externalConfig: {
            endpoint: '/',
            method: 'GET',
            params: {
                Action: 'GetCallerIdentity',
                Version: '2011-06-15'
            },
            providerConfigKey,
            baseUrlOverride: stsBaseUrl
        },
        internalConfig: {
            providerName: provider
        }
    });

    if (proxyConfigResult.isErr()) {
        throw proxyConfigResult.error;
    }

    const proxy = new ProxyRequest({
        proxyConfig: proxyConfigResult.value,
        logger: (msg) => {
            void logCtx?.log(msg);
        },
        getConnection: () => ({
            connection_id,
            connection_config,
            credentials: credentialsForVerification,
            metadata: {}
        }),
        getIntegrationConfig: () => ({
            oauth_client_id: null,
            oauth_client_secret: null
        })
    });

    const result = await proxy.request();
    if (result.isErr()) {
        throw result.error;
    }
}
