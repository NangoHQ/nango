import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { connectionService, getSync, syncManager } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema, syncNameSchema, variantSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { LogContextOrigin } from '@nangohq/logs';
import type { ApiError, DeleteSyncVariant, OperationRowInsert, ValidationError } from '@nangohq/types';

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
    const logCtxData: OperationRowInsert = { operation: { type: 'sync', action: 'delete_variant' } };
    const logCtx: LogContextOrigin = await logContextGetter.create(logCtxData, { account, environment });

    const parsedBody = bodyValidation.safeParse(req.body);
    if (!parsedBody.success) {
        const errResponse: ApiError<'invalid_body', ValidationError[]> = { error: { code: 'invalid_body', errors: zodErrorToHTTP(parsedBody.error) } };
        res.status(400).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Invalid body', { errors: errResponse.error.errors });
        await logCtx.failed();
        return;
    }

    const parsedParams = paramsValidation.safeParse(req.params);
    if (!parsedParams.success) {
        const errResponse: ApiError<'invalid_uri_params', ValidationError[]> = {
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(parsedParams.error) }
        };
        res.status(400).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Invalid URI parameters', { errors: errResponse.error.errors });
        await logCtx.failed();
        return;
    }

    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        const errResponse: ApiError<'invalid_query_params', ValidationError[]> = {
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) }
        };
        res.status(400).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Invalid query parameters', { errors: errResponse.error.errors });
        await logCtx.failed();
        return;
    }

    const body: DeleteSyncVariant['Body'] = parsedBody.data;
    const params: DeleteSyncVariant['Params'] = parsedParams.data;
    await logCtx.enrichOperation({ integrationName: body.provider_config_key, syncConfigName: params.name });

    if (params.variant.toLowerCase() === 'base') {
        const errResponse: ApiError<'invalid_variant'> = {
            error: { code: 'invalid_variant', message: `Cannot delete protected variant "${params.variant}".` }
        };
        res.status(400).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Invalid variant', { variant: params.variant });
        await logCtx.failed();
        return;
    }

    const { response: connection, error } = await connectionService.getConnection(body.connection_id, body.provider_config_key, environment.id);
    if (error || !connection) {
        const errResponse: ApiError<'unknown_connection'> = { error: { code: 'unknown_connection' } };
        res.status(400).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Unknown connection', { connection_id: body.connection_id });
        await logCtx.failed();
        return;
    }
    await logCtx.enrichOperation({ connectionId: connection.id, connectionName: connection.connection_id });

    const sync = await getSync({ connectionId: connection.id, name: params.name, variant: params.variant });
    if (!sync) {
        const errResponse: ApiError<'not_found'> = { error: { code: 'not_found' } };
        res.status(404).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Sync variant not found', { sync_name: params.name, sync_variant: params.variant });
        await logCtx.failed();
        return;
    }
    await logCtx.enrichOperation({ syncConfigId: sync.sync_config_id });

    try {
        await syncManager.softDeleteSync(sync.id, environment.id, orchestrator);
    } catch {
        const errResponse: ApiError<'failed_sync_variant_deletion'> = { error: { code: 'failed_sync_variant_deletion' } };
        res.status(500).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Failed to delete sync variant', { sync_id: sync.id });
        await logCtx.failed();
        return;
    }

    const successResponse: DeleteSyncVariant['Success'] = { success: true };
    res.status(200).send(successResponse);
    await logCtx.info('Sync variant deleted successfully', { sync_id: sync.id });
    await logCtx.success();
});
