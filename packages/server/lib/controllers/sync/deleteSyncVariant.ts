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
    const { account, environment } = res.locals;
    const logCtx = await logContextGetter.create({ operation: { type: 'sync', action: 'delete_variant' } }, { account, environment });

    const parsedBody = bodyValidation.safeParse(req.body);
    if (!parsedBody.success) {
        const errors = zodErrorToHTTP(parsedBody.error);
        res.status(400).send({ error: { code: 'invalid_body', errors } });
        await logCtx.error('Invalid body', { errors });
        await logCtx.failed();
        return;
    }

    const parsedParams = paramsValidation.safeParse(req.params);
    if (!parsedParams.success) {
        const errors = zodErrorToHTTP(parsedParams.error);
        res.status(400).send({ error: { code: 'invalid_uri_params', errors } });
        await logCtx.error('Invalid URI parameters', { errors });
        await logCtx.failed();
        return;
    }

    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        const errors = zodErrorToHTTP(emptyQuery.error);
        res.status(400).send({ error: { code: 'invalid_query_params', errors } });
        await logCtx.error('Invalid query parameters', { errors });
        await logCtx.failed();
        return;
    }

    const body: DeleteSyncVariant['Body'] = parsedBody.data;
    const params: DeleteSyncVariant['Params'] = parsedParams.data;
    const providerConfig = await configService.getProviderConfig(body.provider_config_key, environment.id);
    await logCtx.enrichOperation({
        integrationId: providerConfig?.id,
        integrationName: providerConfig?.unique_key,
        providerName: providerConfig?.provider,
        syncConfigName: params.name
    });

    if (params.variant.toLowerCase() === 'base') {
        res.status(400).send({ error: { code: 'invalid_variant', message: `Cannot delete protected variant "${params.variant}".` } });
        await logCtx.error('Invalid variant', { variant: params.variant });
        await logCtx.failed();
        return;
    }

    const { response: connection, error } = await connectionService.getConnection(body.connection_id, body.provider_config_key, environment.id);
    if (error || !connection) {
        res.status(400).send({ error: { code: 'unknown_connection' } });
        await logCtx.error('Unknown connection', { connection_id: body.connection_id });
        await logCtx.failed();
        return;
    }
    await logCtx.enrichOperation({ connectionId: connection.id, connectionName: connection.connection_id });

    const sync = await getSync({ connectionId: connection.id, name: params.name, variant: params.variant });
    if (!sync) {
        res.status(404).send({ error: { code: 'not_found' } });
        await logCtx.error('Sync variant not found', { sync_name: params.name, sync_variant: params.variant });
        await logCtx.failed();
        return;
    }
    await logCtx.enrichOperation({ syncConfigId: sync.sync_config_id });

    try {
        await syncManager.softDeleteSync(sync.id, environment.id, orchestrator);
    } catch {
        res.status(500).send({ error: { code: 'failed_sync_variant_deletion' } });
        await logCtx.error('Failed to delete sync variant', { sync_id: sync.id });
        await logCtx.failed();
        return;
    }

    res.status(200).send({ success: true });
    await logCtx.info('Sync variant deleted successfully', { id: sync.id, name: sync.name, variant: sync.variant });
    await logCtx.success();
});
