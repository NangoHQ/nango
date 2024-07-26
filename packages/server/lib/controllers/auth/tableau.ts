import type { NextFunction } from 'express';
import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { zodErrorToHTTP, stringifyError } from '@nangohq/utils';
import {
    analytics,
    configService,
    AnalyticsTypes,
    getConnectionConfig,
    connectionService,
    errorManager,
    ErrorSourceEnum,
    LogActionEnum
} from '@nangohq/shared';
import type { TableauAuthorization } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../../hooks/hooks.js';

const bodyValidation = z
    .object({
        pat_name: z.string().min(1),
        pat_secret: z.string().min(1),
        content_url: z.string().optional()
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

export const tableauAuthorization = asyncWrapper<TableauAuthorization>(async (req, res, next: NextFunction) => {
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
    const { pat_name: patName, pat_secret: patSecret, content_url: contentUrl } = val.data;
    const { connection_id: connectionId } = queryStringVal.data;
    const { providerConfigKey } = paramVal.data;
    const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};

    let logCtx: LogContext | undefined;

    try {
        const logCtx = await logContextGetter.create(
            {
                operation: { type: 'auth', action: 'create_connection' },
                message: 'Create connection via Tableau',
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
        if (!config) {
            await logCtx.error('Unknown provider config');
            await logCtx.failed();
            res.status(404).send({ error: { code: 'unknown_provider_config' } });
            return;
        }

        const template = configService.getTemplate(config.provider);
        if (template.auth_mode !== 'TABLEAU') {
            await logCtx.error('Provider does not support Tableau auth', { provider: config.provider });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_auth_mode' } });
            return;
        }

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        const {
            success,
            error,
            response: credentials
        } = await connectionService.getTableauCredentials(template, patName, patSecret, connectionConfig, contentUrl);

        if (!success || !credentials) {
            await logCtx.error('Error during Tableau credentials creation', { error, provider: config.provider });
            await logCtx.failed();

            errorManager.errRes(res, 'tableau_error');

            return;
        }

        await logCtx.info('Tableau credentials creation was successful');
        await logCtx.success();
        const [updatedConnection] = await connectionService.upsertTableauConnection({
            connectionId,
            providerConfigKey,
            credentials,
            connectionConfig,
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
    } catch (err) {
        const prettyError = stringifyError(err, { pretty: true });

        void connectionCreationFailedHook(
            {
                connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                environment,
                account,
                auth_mode: 'TABLEAU',
                error: {
                    type: 'unknown',
                    description: `Error during Unauth create: ${prettyError}`
                },
                operation: 'unknown'
            },
            'unknown',
            logCtx
        );
        if (logCtx) {
            await logCtx.error('Error during Tableau credentials creation', { error: err });
            await logCtx.failed();
        }

        errorManager.report(err, {
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.AUTH,
            environmentId: environment.id,
            metadata: {
                providerConfigKey,
                connectionId
            }
        });

        next(err);
    }
});
