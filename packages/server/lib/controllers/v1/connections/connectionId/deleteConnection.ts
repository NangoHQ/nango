import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import type { DeleteConnection } from '@nangohq/types';
import { connectionService } from '@nangohq/shared';
import { getOrchestrator } from '../../../../utils/utils.js';
import { logContextGetter } from '@nangohq/logs';
import { connectionIdSchema, envSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';
import { preConnectionDeletion } from '../../../../hooks/connection/on/connection-deleted.js';

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

export const deleteConnection = asyncWrapper<DeleteConnection>(async (req, res) => {
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
        logContextGetter,
        orchestrator,
        preDeletionHook
    });

    res.status(200).send({ success: deleted > 0 });
});
