import { z } from 'zod';
import tracer from 'dd-trace';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import { analytics, configService, AnalyticsTypes, getConnectionConfig, connectionService } from '@nangohq/shared';
import type { TbaAuthorization, TbaCredentials } from '@nangohq/types';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';
import { connectionCreated as connectionCreatedHook, connectionTest as connectionTestHook } from '../../hooks/hooks.js';

const bodyValidation = z
    .object({
        token_id: z.string().nonempty(),
        token_secret: z.string().nonempty(),
        oauth_client_id_override: z.string().optional(),
        oauth_client_secret_override: z.string().optional()
    })
    .strict();

const queryStringValidation = z
    .object({
        connection_id: z.string().nonempty(),
        params: z.record(z.any()).optional(),
        authorization_params: z.record(z.any()).optional(),
        user_scope: z.string().optional(),
        public_key: z.string().uuid(),
        hmac: z.string().optional()
    })
    .strict();

const paramValidation = z
    .object({
        providerConfigKey: z.string().nonempty()
    })
    .strict();

export const tbaAuthorization = asyncWrapper<TbaAuthorization>(async (req, res) => {
    const val = bodyValidation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const queryStringVal = queryStringValidation.safeParse(req.query);

    if (!queryStringVal.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringVal.error) }
        });
        return;
    }
    const paramVal = paramValidation.safeParse(req.params);

    if (!paramVal.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramVal.error) }
        });
        return;
    }

    const { account, environment } = res.locals;

    const body = val.data;

    const { token_id: tokenId, token_secret: tokenSecret, oauth_client_id_override, oauth_client_secret_override } = body;

    const { connection_id: connectionId, params } = queryStringVal.data;
    const { providerConfigKey } = paramVal.data;

    const logCtx = await logContextGetter.create(
        {
            operation: { type: 'auth', action: 'create_connection' },
            message: 'Create connection via TBA',
            expiresAt: defaultOperationExpiration.auth()
        },
        { account, environment }
    );
    void analytics.track(AnalyticsTypes.PRE_TBA_AUTH, account.id);

    await hmacCheck({
        environment,
        logCtx,
        providerConfigKey,
        connectionId,
        hmac: queryStringVal.data.hmac,
        res
    });

    const config = await configService.getProviderConfig(providerConfigKey, environment.id);

    if (config == null) {
        await logCtx.error('Unknown provider config');
        await logCtx.failed();

        res.status(404).send({
            error: { code: 'unknown_provider_config' }
        });

        return;
    }

    const template = configService.getTemplate(config.provider);

    if (template.auth_mode !== 'TBA') {
        await logCtx.error('Provider does not support TBA auth', { provider: config.provider });
        await logCtx.failed();

        res.status(400).send({
            error: { code: 'invalid_auth_mode' }
        });

        return;
    }

    await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

    const connectionConfig = params ? getConnectionConfig(params) : {};

    const tbaCredentials: TbaCredentials = {
        type: 'TBA',
        token_id: tokenId,
        token_secret: tokenSecret,
        config_override: {}
    };

    if (oauth_client_id_override || oauth_client_secret_override) {
        const obfuscatedClientSecret = oauth_client_secret_override ? oauth_client_secret_override.slice(0, 4) + '***' : '';

        await logCtx.info('Credentials override', {
            oauth_client_id: oauth_client_id_override || '',
            oauth_client_secret: obfuscatedClientSecret
        });

        if (oauth_client_id_override) {
            tbaCredentials.config_override['client_id'] = oauth_client_id_override;
        }

        if (oauth_client_secret_override) {
            tbaCredentials.config_override['client_secret'] = oauth_client_secret_override;
        }
    }

    const connectionResponse = await connectionTestHook(
        config.provider,
        template,
        tbaCredentials,
        connectionId,
        providerConfigKey,
        environment.id,
        connectionConfig,
        tracer
    );

    if (connectionResponse.isErr()) {
        await logCtx.error('Provided credentials are invalid', { provider: config.provider });
        await logCtx.failed();

        res.send({
            error: { code: 'invalid_credentials', message: 'The provided credentials did not succeed in a test API call' }
        });

        return;
    }

    await logCtx.info('Tba connection creation was successful');
    await logCtx.success();

    const [updatedConnection] = await connectionService.upsertTbaConnection({
        connectionId,
        providerConfigKey,
        credentials: tbaCredentials,
        connectionConfig: {
            ...connectionConfig,
            oauth_client_id: config.oauth_client_id,
            oauth_client_secret: config.oauth_client_secret
        },
        metadata: {},
        config,
        environment,
        account
    });

    if (updatedConnection) {
        await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
        void connectionCreatedHook(
            {
                connection: updatedConnection.connection,
                environment,
                account,
                auth_mode: 'NONE',
                operation: updatedConnection.operation
            },
            config.provider,
            logContextGetter,
            undefined,
            logCtx
        );
    }

    res.status(200).send({ providerConfigKey, connectionId });
});
