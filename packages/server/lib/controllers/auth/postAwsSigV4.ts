import { validate as isUuid, v4 as uuidv4 } from 'uuid';
import * as z from 'zod';

import db from '@nangohq/database';
import { defaultOperationExpiration, endUserToMeta, logContextGetter } from '@nangohq/logs';
import {
    awsSigV4Client,
    configService,
    connectionService,
    errorManager,
    ErrorSourceEnum,
    getProvider,
    getProxyConfiguration,
    getServerOutboundUrlPolicy,
    LogActionEnum,
    NangoError,
    ProxyRequest,
    syncEndUserToConnection
} from '@nangohq/shared';
import { metrics, zodErrorToHTTP } from '@nangohq/utils';

import { connectionConfigParamsSchema, connectionCredential, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { handleValidateConnectionFailure, validateConnection } from '../../hooks/connection/on/validate-connection.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../../hooks/hooks.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { errorRestrictConnectionId, isIntegrationAllowed, resolveConnectionConfig } from '../../utils/auth.js';
import { hmacCheck } from '../../utils/hmac.js';

import type { LogContext } from '@nangohq/logs';
import type { Config as ProviderConfig } from '@nangohq/shared';
import type { AuthOperationType, AwsSigV4Credentials, PostPublicAwsSigV4Authorization } from '@nangohq/types';
import type { NextFunction } from 'express';

const bodyValidation = z
    .object({
        role_arn: z.string().min(1),
        // Region is interpolated into the (owner-signed) STS URL and the proxy base URL — constrain it
        // to AWS's region shape so it can't inject a different host. See isValidAwsRegion.
        region: z
            .string()
            .min(1)
            .max(64)
            .regex(/^[a-z0-9-]+$/, 'AWS region must contain only lowercase letters, digits, and hyphens')
            .optional()
    })
    .strict();

const queryValidation = z
    .object({
        connection_id: connectionIdSchema.optional(),
        params: connectionConfigParamsSchema,
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
    const connectionConfig = resolveConnectionConfig({ params: query.params, connectSession, providerConfigKey });
    const hmac = 'hmac' in query ? query.hmac : undefined;
    const isConnectSession = res.locals['authType'] === 'connectSession';

    if (isConnectSession && query.connection_id) {
        errorRestrictConnectionId(res);
        return;
    }

    let logCtx: LogContext | undefined;
    let config: ProviderConfig | null = null;
    // Track the operation so the failure hook reports 'override' for reconnect attempts rather than
    // mislabelling them as 'creation'. Starts as 'unknown' (pre-existing-connection lookup), becomes
    // 'creation' or 'override' once we know whether a connection already exists, and is refined to
    // storedConnection.operation after a successful upsert.
    let attemptedOperation: AuthOperationType = 'unknown';

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

        // Look up the existing connection once. Used to resolve both region and external_id on
        // reconnects — without this, a reconnect without explicit region input would fall through
        // to settings.defaultRegion and silently overwrite the customer's original region,
        // changing the SigV4 signing region and proxy endpoint.
        let existingConnectionConfig: Record<string, unknown> | null = null;
        if (isConnectSession && connectSession.connectionId) {
            const existing = await connectionService.getConnectionById(connectSession.connectionId);
            if (!existing) {
                void logCtx.error('Invalid connection');
                await logCtx.failed();
                res.status(400).send({ error: { code: 'invalid_connection' } });
                return;
            }
            connectionId = existing.connection_id;
            existingConnectionConfig = existing.connection_config ?? null;
        } else {
            // Non-connect-session reconnect path: look up by connection_id + integration key.
            const existingResult = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
            existingConnectionConfig = existingResult.response?.connection_config ?? null;
        }
        const hasExistingConnection = existingConnectionConfig !== null;
        attemptedOperation = hasExistingConnection ? 'override' : 'creation';

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        const settingsResult = awsSigV4Client.getAwsSigV4Settings(config);
        if (settingsResult.isErr()) {
            void logCtx.error('Missing AWS SigV4 settings', { error: settingsResult.error });
            await logCtx.failed();
            errorManager.errResFromNangoErr(res, settingsResult.error);
            return;
        }
        const settings = settingsResult.value;

        // Region priority: on reconnect the stored region is pinned (the IAM/signing setup depends on
        // it and the Connect UI doesn't re-collect it); only on a fresh connect do we take explicit
        // input > client-pre-seeded value > integration owner default.
        const storedRegion = existingConnectionConfig?.['region'] as string | undefined;
        const resolvedRegion = storedRegion || body.region || (connectionConfig['region'] as string) || settings.defaultRegion;
        if (!resolvedRegion) {
            const err = new NangoError('missing_aws_sigv4_region');
            errorManager.errResFromNangoErr(res, err);
            await logCtx.failed();
            return;
        }

        if (!awsSigV4Client.isValidAwsRegion(resolvedRegion)) {
            void logCtx.error('Invalid AWS region format', { region: resolvedRegion });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_body', message: 'AWS region must contain only lowercase letters, digits, and hyphens' } });
            return;
        }

        const storedExternalId = existingConnectionConfig?.['external_id'] as string | undefined;
        const clientExternalId = typeof connectionConfig['external_id'] === 'string' ? connectionConfig['external_id'].trim() : '';
        const externalId = storedExternalId || (clientExternalId && isUuid(clientExternalId) ? clientExternalId : uuidv4());

        if (!isValidAwsExternalId(externalId)) {
            void logCtx.error('Invalid external ID format', { externalId });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_body', message: 'External ID must be 2-1224 characters, alphanumeric or +=,.@:/-' } });
            return;
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

        try {
            await verifyAwsCredentials({
                provider: config.provider,
                providerConfigKey,
                credentials,
                connection_id: connectionId,
                connection_config: connectionConfig,
                logCtx
            });
        } catch (err) {
            void logCtx.error('AWS SigV4 credential verification failed', { error: err });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'connection_test_failed', message: err instanceof Error ? err.message : 'Connection test failed' } });
            return;
        }

        const [storedConnection] = await connectionService.upsertAuthConnection({
            connectionId,
            providerConfigKey,
            credentials,
            connectionConfig,
            metadata: {},
            config,
            environment,
            tags: connectSession?.tags
        });

        if (!storedConnection) {
            res.status(500).send({ error: { code: 'server_error', message: 'failed to create connection' } });
            void logCtx.error('Failed to create connection');
            await logCtx.failed();
            return;
        }
        attemptedOperation = storedConnection.operation;

        const customValidationResponse = await validateConnection({
            connection: storedConnection.connection,
            config,
            account,
            logCtx
        });
        if (customValidationResponse.isErr()) {
            void logCtx.error('Connection failed custom validation', { error: customValidationResponse.error });

            const message = await handleValidateConnectionFailure({
                operation: storedConnection.operation,
                connection: storedConnection.connection,
                config,
                account,
                environment,
                provider,
                error: customValidationResponse.error,
                logCtx
            });

            await logCtx.failed();

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
                connection: { connection_id: connectionId, provider_config_key: providerConfigKey, connection_config: connectionConfig },
                environment,
                account,
                auth_mode: 'AWS_SIGV4',
                error: { type: 'server_error', description: 'Error creating AWS SigV4 connection' },
                operation: attemptedOperation
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
    if (!awsSigV4Client.isValidAwsRegion(verificationRegion)) {
        throw new NangoError('invalid_aws_sigv4_config', { message: 'AWS region must contain only lowercase letters, digits, and hyphens' });
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
        outboundPolicy: getServerOutboundUrlPolicy(),
        logger: (msg) => {
            void logCtx?.log(msg);
        },
        getConnection: () => ({
            connection_id,
            connection_config,
            credentials: credentialsForVerification,
            metadata: {}
        }),
        getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null })
    });

    const result = await proxy.request();
    if (result.isErr()) {
        throw result.error;
    }

    // Verify the assumed role matches the expected role ARN
    const expectedRoleArn = credentials.role_arn;
    if (expectedRoleArn && result.value.data) {
        const responseData = typeof result.value.data === 'string' ? result.value.data : '';
        const arnMatch = responseData.match(/<Arn>([^<]+)<\/Arn>/);
        if (arnMatch?.[1]) {
            const actualArn = arnMatch[1];
            // Compare role ARN cores: assumed-role ARN differs from role ARN
            // e.g. arn:aws:sts::123:assumed-role/MyRole/session vs arn:aws:iam::123:role/MyRole
            const expectedRoleName = expectedRoleArn.split('/').pop();
            const actualContainsExpectedRole = expectedRoleName && actualArn.includes(expectedRoleName);
            if (!actualContainsExpectedRole) {
                void logCtx.warn('GetCallerIdentity ARN does not match expected role', {
                    expectedRoleArn,
                    actualArn
                });
                throw new Error('GetCallerIdentity ARN does not match expected role');
            }
        }
    }
}

/**
 * Validate external ID per AWS STS format: 2-1224 characters, alphanumeric plus +=,.@:/-
 */
function isValidAwsExternalId(externalId: string): boolean {
    return externalId.length >= 2 && externalId.length <= 1224 && /^[a-zA-Z0-9+=,.@:/-]+$/.test(externalId);
}
