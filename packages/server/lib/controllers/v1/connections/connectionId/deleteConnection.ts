import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, pubsub } from '@nangohq/shared';
import { report, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, envSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';
import { preConnectionDeletion } from '../../../../hooks/connection/on/pre-connection-deletion.js';
import { connectionDeleted } from '../../../../hooks/hooks.js';
import { slackService } from '../../../../services/slack.js';
import { asyncWrapperWithEnvironment } from '../../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../../utils/utils.js';

import type { DeleteConnection } from '@nangohq/types';

const validationQuery = z
    .object({
        provider_config_key: providerConfigKeySchema,
        env: envSchema
    })
    .strict();
const validationParams = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

const orchestrator = getOrchestrator();

export const deleteConnection = asyncWrapperWithEnvironment<DeleteConnection>(async (req, res) => {
    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const { environment, account: team } = res.locals;
    const params: DeleteConnection['Params'] = valParams.data;
    const query: DeleteConnection['Querystring'] = valQuery.data;

    const { success, response: connection } = await connectionService.getConnection(params.connectionId, query.provider_config_key, environment.id);
    if (!success || !connection) {
        res.status(400).send({ error: { code: 'unknown_connection' } });
        return;
    }

    const providerConfig = await configService.getProviderConfig(query.provider_config_key, environment.id);
    if (!providerConfig) {
        res.status(400).send({ error: { code: 'unknown_provider_config' } });
        return;
    }

    const preDeletionHook = () =>
        preConnectionDeletion({
            team,
            environment,
            connection,
            logContextGetter
        });
    const deleted = await connectionService.deleteConnection({
        connection,
        providerConfigKey: query.provider_config_key,
        environmentId: environment.id,
        slackService,
        orchestrator,
        preDeletionHook
    });

    if (deleted > 0) {
        void connectionDeleted({
            connection,
            environment,
            account: team,
            config: providerConfig
        }).catch((err) => {
            report(new Error('connection_deletion_webhook_delivery_failed', { cause: err }), { id: connection.id });
        });
    }

    void pubsub.publisher.publish({
        subject: 'usage',
        type: 'usage.connections',
        payload: {
            value: -1,
            properties: {
                accountId: team.id,
                environmentId: connection.environment_id,
                environmentName: environment.name,
                integrationId: query.provider_config_key,
                connectionId: connection.connection_id
            }
        }
    });

    res.status(200).send({ success: deleted > 0 });
});
