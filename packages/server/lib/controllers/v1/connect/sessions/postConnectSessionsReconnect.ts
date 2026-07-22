import * as z from 'zod';

import db from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import { defaultOperationExpiration, endUserToMeta, logContextGetter } from '@nangohq/logs';
import { connectionService, getEndUser } from '@nangohq/shared';
import { buildConnectUiSessionLink, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';
import * as connectSessionService from '../../../../services/connectSession.service.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PostInternalConnectSessionsReconnect } from '@nangohq/types';

const bodySchema = z
    .object({
        connection_id: connectionIdSchema,
        provider_config_key: providerConfigKeySchema
    })
    .strict();

interface Reply {
    status: number;
    response: PostInternalConnectSessionsReconnect['Reply'];
}

export const postInternalConnectSessionsReconnect = asyncWrapper<PostInternalConnectSessionsReconnect>(async (req, res) => {
    const valQuery = requireEmptyQuery(req, { withEnv: true });
    if (valQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const valBody = bodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { account, environment } = res.locals;
    const body: PostInternalConnectSessionsReconnect['Body'] = valBody.data;

    const { status, response }: Reply = await db.knex.transaction<Reply>(async (trx) => {
        const connection = await connectionService.checkIfConnectionExists(trx, {
            connectionId: body.connection_id,
            providerConfigKey: body.provider_config_key,
            environmentId: environment.id
        });
        if (!connection) {
            return { status: 400, response: { error: { code: 'invalid_body', message: 'ConnectionID or IntegrationId does not exists' } } };
        }

        let endUser = null;
        if (connection.end_user_id) {
            const endUserRes = await getEndUser(trx, { id: connection.end_user_id, accountId: account.id, environmentId: environment.id }, { forUpdate: true });
            if (endUserRes.isErr()) {
                return { status: 500, response: { error: { code: 'server_error', message: endUserRes.error.message } } };
            }
            endUser = endUserRes.value;
        }

        const logCtx = await logContextGetter.create(
            {
                operation: { type: 'auth', action: 'create_connection' },
                meta: { authType: 'unauth', connectSession: endUserToMeta(endUser) },
                expiresAt: defaultOperationExpiration.auth()
            },
            { account, environment }
        );

        // Reuse the connection's existing tags as-is: this is an existing connection being re-authenticated,
        // not a new one, so its tags (e.g. `origin`) must not be overwritten by this dashboard-initiated session.
        const createConnectSession = await connectSessionService.createConnectSession(trx, {
            endUserId: endUser?.id ?? null,
            endUser: null,
            accountId: account.id,
            environmentId: environment.id,
            connectionId: connection.id,
            allowedIntegrations: [body.provider_config_key],
            integrationsConfigDefaults: null,
            operationId: logCtx.id,
            overrides: null,
            webhookUrlOverride: null,
            tags: connection.tags
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
        const connect_link = buildConnectUiSessionLink(token);
        return { status: 201, response: { data: { token, connect_link, expires_at: privateKey.expiresAt!.toISOString() } } };
    });

    res.status(status).send(response);
});
