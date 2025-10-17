import * as z from 'zod';

import db from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import { endUserToMeta, logContextGetter } from '@nangohq/logs';
import { EndUserMapper, configService, connectionService, getEndUser } from '@nangohq/shared';
import { connectUrl, flagHasPlan, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { bodySchema as originalBodySchema, checkIntegrationsExist } from './postSessions.js';
import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import * as connectSessionService from '../../services/connectSession.service.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { PostPublicConnectSessionsReconnect } from '@nangohq/types';

const bodySchema = z
    .object({
        connection_id: connectionIdSchema,
        integration_id: providerConfigKeySchema,
        end_user: originalBodySchema.shape.end_user.optional(),
        organization: originalBodySchema.shape.organization,
        integrations_config_defaults: originalBodySchema.shape.integrations_config_defaults,
        overrides: originalBodySchema.shape.overrides.optional()
    })
    .strict();

interface Reply {
    status: number;
    response: PostPublicConnectSessionsReconnect['Reply'];
}

export const postConnectSessionsReconnect = asyncWrapper<PostPublicConnectSessionsReconnect>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = bodySchema.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { account, environment, plan } = res.locals;
    const body: PostPublicConnectSessionsReconnect['Body'] = val.data;

    const { status, response }: Reply = await db.knex.transaction<Reply>(async (trx) => {
        const connection = await connectionService.checkIfConnectionExists(trx, {
            connectionId: body.connection_id,
            providerConfigKey: body.integration_id,
            environmentId: environment.id
        });
        if (!connection) {
            return {
                status: 400,
                response: { error: { code: 'invalid_body', message: 'ConnectionID or IntegrationId does not exists' } }
            };
        }

        if (!connection.end_user_id) {
            return {
                status: 400,
                response: { error: { code: 'invalid_body', message: "Can't update a connection that was not created with a session token" } }
            };
        }

        const endUserRes = await getEndUser(trx, { id: connection.end_user_id, accountId: account.id, environmentId: environment.id }, { forUpdate: true });
        if (endUserRes.isErr()) {
            return { status: 500, response: { error: { code: 'server_error', message: endUserRes.error.message } } };
        }

        const endUser = endUserRes.value;

        if (body.integrations_config_defaults || body.overrides) {
            const integrations = await configService.listProviderConfigs(trx, environment.id);

            // Enforce that integrations in `integrations_config_defaults` and `overrides` exist
            const integrationConfigDefaultsCheck = checkIntegrationsExist(body.integrations_config_defaults, integrations, ['integrations_config_defaults']);
            const overridesCheck = checkIntegrationsExist(body.overrides, integrations, ['overrides']);
            if (integrationConfigDefaultsCheck || overridesCheck) {
                return {
                    status: 400,
                    response: {
                        error: {
                            code: 'invalid_body',
                            errors: zodErrorToHTTP({ issues: [...(integrationConfigDefaultsCheck || []), ...(overridesCheck || [])] })
                        }
                    }
                };
            }

            const canOverrideDocsConnectUrl = (flagHasPlan && plan?.can_override_docs_connect_url) ?? true;
            const isOverridingDocsConnectUrl = Object.values(body.overrides || {}).some((value) => value.docs_connect);
            if (isOverridingDocsConnectUrl && !canOverrideDocsConnectUrl) {
                return {
                    status: 403,
                    response: { error: { code: 'forbidden', message: 'You are not allowed to override the docs connect url' } }
                };
            }
        }

        const logCtx = await logContextGetter.create(
            { operation: { type: 'auth', action: 'create_connection' }, meta: { authType: 'unauth', connectSession: endUserToMeta(endUser) } },
            { account, environment }
        );

        // create connect session
        const createConnectSession = await connectSessionService.createConnectSession(trx, {
            endUserId: endUser.id,
            endUser: body.end_user ? EndUserMapper.apiToEndUser(body.end_user, body.organization) : null,
            accountId: account.id,
            environmentId: environment.id,
            connectionId: connection.id,
            allowedIntegrations: [body.integration_id],
            integrationsConfigDefaults: body.integrations_config_defaults
                ? Object.fromEntries(
                      Object.entries(body.integrations_config_defaults).map(([key, value]) => [
                          key,
                          { user_scopes: value.user_scopes, connectionConfig: value.connection_config }
                      ])
                  )
                : null,
            operationId: logCtx.id,
            overrides: body.overrides || null
        });
        if (createConnectSession.isErr()) {
            return { status: 500, response: { error: { code: 'server_error', message: 'Failed to create connect session' } } };
        }

        // create a private key for the connect session
        const createPrivateKey = await keystore.createPrivateKey(trx, {
            displayName: '',
            accountId: account.id,
            environmentId: environment.id,
            entityType: 'connect_session',
            entityId: createConnectSession.value.id,
            ttlInMs: 30 * 60 * 1000 // 30 minutes
        });
        if (createPrivateKey.isErr()) {
            return { status: 500, response: { error: { code: 'server_error', message: 'Failed to create session token' } } };
        }

        const [token, privateKey] = createPrivateKey.value;
        const auth_url = new URL(`${connectUrl}?session_token=${token}`).toString();
        return { status: 201, response: { data: { token, auth_url, expires_at: privateKey.expiresAt!.toISOString() } } };
    });

    res.status(status).send(response);
});
