import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, createSync, getSyncConfig, getSyncConfigByParams, getSyncsByConnectionId } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../env.js';
import { connectionIdSchema, providerConfigKeySchema, syncNameSchema, variantSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { LogContextOrigin } from '@nangohq/logs';
import type { ApiError, DBConnection, OperationRowInsert, PostSyncVariant, ValidationError } from '@nangohq/types';

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

export const postSyncVariant = asyncWrapper<PostSyncVariant>(async (req, res) => {
    const { account, environment, plan } = res.locals;
    const logCtxData: OperationRowInsert = { operation: { type: 'sync', action: 'create_variant' } };
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

    const body: PostSyncVariant['Body'] = parsedBody.data;
    const params: PostSyncVariant['Params'] = parsedParams.data;
    const providerConfig = await configService.getProviderConfig(body.provider_config_key, environment.id);
    await logCtx.enrichOperation({
        integrationId: providerConfig?.id,
        integrationName: providerConfig?.unique_key,
        providerName: providerConfig?.provider,
        syncConfigName: params.name
    });

    if (params.variant.toLowerCase() === 'base') {
        const errResponse: ApiError<'invalid_variant'> = { error: { code: 'invalid_variant', message: `Variant name "${params.variant}" is protected.` } };
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

    const syncs = await getSyncsByConnectionId({ connectionId: connection.id });
    if (!syncs) {
        const errResponse: ApiError<'failed_sync_variant_creation'> = { error: { code: 'failed_sync_variant_creation' } };
        res.status(500).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Failed to get syncs by connection ID', { connection_id: body.connection_id });
        await logCtx.failed();
        return;
    }

    const maxVariantsPerSync = plan?.variants_per_sync_max ?? envs.MAX_SYNCS_PER_CONNECTION;
    const variantsForSync = syncs.filter((s) => s.name === params.name);
    if (variantsForSync.length >= maxVariantsPerSync) {
        const errResponse: ApiError<'resource_capped'> = {
            error: { code: 'resource_capped', message: `Maximum number of variants per sync (${maxVariantsPerSync}) reached` }
        };
        res.status(400).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Resource capped', { max_variants_per_sync: maxVariantsPerSync });
        await logCtx.failed();
        return;
    }

    const existingSync = syncs.find((s) => s.name === params.name && s.variant === params.variant) || null;

    if (existingSync) {
        const errResponse: ApiError<'sync_variant_already_exists'> = { error: { code: 'sync_variant_already_exists' } };
        res.status(400).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Sync variant already exists', { sync_name: params.name, sync_variant: params.variant });
        await logCtx.failed();
        return;
    }

    if (!providerConfig) {
        const errResponse: ApiError<'unknown_provider_config'> = { error: { code: 'unknown_provider_config' } };
        res.status(400).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Unknown provider config', { provider_config_key: body.provider_config_key });
        await logCtx.failed();
        return;
    }

    const syncConfig = await getSyncConfigByParams(environment.id, params.name, body.provider_config_key);
    if (!syncConfig) {
        const errResponse: ApiError<'unknown_sync'> = { error: { code: 'unknown_sync' } };
        res.status(400).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Unknown sync', { sync_name: params.name, provider_config_key: body.provider_config_key });
        await logCtx.failed();
        return;
    }

    const nangoConfig = await getSyncConfig({ nangoConnection: connection as DBConnection, syncName: params.name });
    if (!nangoConfig) {
        const errResponse: ApiError<'failed_sync_variant_creation'> = { error: { code: 'failed_sync_variant_creation' } };
        res.status(500).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Failed to get nango config', {
            sync_name: params.name,
            provider_config_key: body.provider_config_key
        });
        await logCtx.failed();
        return;
    }

    const syncData = nangoConfig.integrations[body.provider_config_key]?.[params.name];
    if (!syncData) {
        const errResponse: ApiError<'failed_sync_variant_creation'> = { error: { code: 'failed_sync_variant_creation' } };
        res.status(500).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Failed to get sync data', { sync_name: params.name, provider_config_key: body.provider_config_key });
        await logCtx.failed();
        return;
    }

    const sync = await createSync({
        syncConfig: syncConfig,
        connectionId: connection.id,
        variant: params.variant
    });
    if (!sync) {
        const errResponse: ApiError<'failed_sync_variant_creation'> = { error: { code: 'failed_sync_variant_creation' } };
        res.status(500).send(errResponse);
        await logCtx.error(errResponse.error.message ?? 'Failed to create sync', { sync_name: params.name, provider_config_key: body.provider_config_key });
        await logCtx.failed();
        return;
    }
    await logCtx.enrichOperation({ syncConfigId: sync.sync_config_id });

    await orchestrator.scheduleSync({
        nangoConnection: connection,
        sync,
        providerConfig,
        syncName: sync.name,
        syncVariant: sync.variant,
        syncData,
        logContextGetter
    });

    const successResponse: PostSyncVariant['Success'] = {
        id: sync.id,
        name: sync.name,
        variant: sync.variant
    };
    res.status(200).send(successResponse);
    await logCtx.info('Sync variant created successfully', { sync_id: sync.id });
    await logCtx.success();
});
