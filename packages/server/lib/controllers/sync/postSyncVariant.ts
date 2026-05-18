import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, createSync, getSyncConfig, getSyncConfigByParams, getSyncsByConnectionId } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../env.js';
import { connectionIdSchema, providerConfigKeySchema, syncNameSchema, variantSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { DBConnection, PostSyncVariant } from '@nangohq/types';

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
    const logCtx = await logContextGetter.create({ operation: { type: 'sync', action: 'create_variant' } }, { account, environment });

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
        res.status(400).send({ error: { code: 'invalid_variant', message: `Variant name "${params.variant}" is protected.` } });
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

    const syncs = await getSyncsByConnectionId({ connectionId: connection.id });
    if (!syncs) {
        res.status(500).send({ error: { code: 'failed_sync_variant_creation' } });
        await logCtx.error('Failed to get syncs by connection ID', { connection_id: body.connection_id });
        await logCtx.failed();
        return;
    }

    const maxVariantsPerSync = plan?.variants_per_sync_max ?? envs.MAX_SYNCS_PER_CONNECTION;
    const variantsForSync = syncs.filter((s) => s.name === params.name);
    if (variantsForSync.length >= maxVariantsPerSync) {
        res.status(400).send({ error: { code: 'resource_capped', message: `Maximum number of variants per sync (${maxVariantsPerSync}) reached` } });
        await logCtx.error('Resource capped', { max_variants_per_sync: maxVariantsPerSync });
        await logCtx.failed();
        return;
    }

    const existingSync = syncs.find((s) => s.name === params.name && s.variant === params.variant) || null;

    if (existingSync) {
        res.status(400).send({ error: { code: 'sync_variant_already_exists' } });
        await logCtx.error('Sync variant already exists', { sync_name: params.name, sync_variant: params.variant });
        await logCtx.failed();
        return;
    }

    if (!providerConfig) {
        res.status(400).send({ error: { code: 'unknown_provider_config' } });
        await logCtx.error('Unknown provider config', { provider_config_key: body.provider_config_key });
        await logCtx.failed();
        return;
    }

    const syncConfig = await getSyncConfigByParams(environment.id, params.name, body.provider_config_key);
    if (!syncConfig) {
        res.status(400).send({ error: { code: 'unknown_sync' } });
        await logCtx.error('Unknown sync', { sync_name: params.name, provider_config_key: body.provider_config_key });
        await logCtx.failed();
        return;
    }

    const nangoConfig = await getSyncConfig({ nangoConnection: connection as DBConnection, syncName: params.name });
    if (!nangoConfig) {
        res.status(500).send({ error: { code: 'failed_sync_variant_creation' } });
        await logCtx.error('Failed to get nango config', { sync_name: params.name, provider_config_key: body.provider_config_key });
        await logCtx.failed();
        return;
    }

    const syncData = nangoConfig.integrations[body.provider_config_key]?.[params.name];
    if (!syncData) {
        res.status(500).send({ error: { code: 'failed_sync_variant_creation' } });
        await logCtx.error('Failed to get sync data', { sync_name: params.name, provider_config_key: body.provider_config_key });
        await logCtx.failed();
        return;
    }

    const sync = await createSync({
        syncConfig: syncConfig,
        connectionId: connection.id,
        variant: params.variant
    });
    if (!sync) {
        res.status(500).send({ error: { code: 'failed_sync_variant_creation' } });
        await logCtx.error('Failed to create sync', { sync_name: params.name, provider_config_key: body.provider_config_key });
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

    res.status(200).send({ id: sync.id, name: sync.name, variant: sync.variant });
    await logCtx.info('Sync variant created successfully', { id: sync.id, name: sync.name, variant: sync.variant });
    await logCtx.success();
});
