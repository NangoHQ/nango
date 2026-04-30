import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, getSync, syncManager } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema, syncNameSchema, variantSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { DeleteSyncVariant } from '@nangohq/types';

const orchestrator = getOrchestrator();

const bodyValidation = z
    .object({
        provider_config_key: providerConfigKeySchema,
        connection_id: connectionIdSchema
    })
    .strict();

const paramsValidation = z
    .object({
        name: syncNameSchema,
        variant: variantSchema
    })
    .strict();

export const deleteSyncVariant = asyncWrapper<DeleteSyncVariant>(async (req, res) => {
    const parsedBody = bodyValidation.safeParse(req.body);
    if (!parsedBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(parsedBody.error) } });
        return;
    }

    const parsedParams = paramsValidation.safeParse(req.params);
    if (!parsedParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(parsedParams.error) } });
        return;
    }

    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const body: DeleteSyncVariant['Body'] = parsedBody.data;
    const params: DeleteSyncVariant['Params'] = parsedParams.data;
    const { account, environment } = res.locals;

    if (params.variant.toLowerCase() === 'base') {
        res.status(400).send({ error: { code: 'invalid_variant', message: `Cannot delete protected variant "${params.variant}".` } });
        return;
    }
    const { response: connection, error } = await connectionService.getConnection(body.connection_id, body.provider_config_key, environment.id);
    if (error || !connection) {
        res.status(400).send({ error: { code: 'unknown_connection' } });
        return;
    }

    const sync = await getSync({ connectionId: connection.id, name: params.name, variant: params.variant });
    if (!sync) {
        res.status(404).send({ error: { code: 'not_found' } });
        return;
    }

    try {
        await syncManager.softDeleteSync(sync.id, environment.id, orchestrator);
    } catch {
        res.status(500).send({ error: { code: 'failed_sync_variant_deletion' } });
        return;
    }

    res.status(200).send({ success: true });

    const providerConfig = await configService.getProviderConfig(body.provider_config_key, environment.id);
    const logCtx = await logContextGetter.create(
        { operation: { type: 'sync', action: 'delete_variant' } },
        {
            account,
            environment,
            ...(providerConfig
                ? {
                      integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider }
                  }
                : {}),
            connection: { id: connection.id, name: connection.connection_id },
            syncConfig: { id: sync.sync_config_id, name: sync.name }
        }
    );
    await logCtx.info(`Deleting sync variant '${params.variant}' for '${params.name}'`, {
        syncName: params.name,
        syncVariant: params.variant,
        connection: connection.connection_id,
        integration: providerConfig?.unique_key ?? body.provider_config_key,
        syncId: sync.id
    });
    await logCtx.success();
});
