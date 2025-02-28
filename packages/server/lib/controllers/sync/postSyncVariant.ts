import { z } from 'zod';
import { zodErrorToHTTP, requireEmptyQuery } from '@nangohq/utils';
import type { DBConnection, PostSyncVariant } from '@nangohq/types';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { connectionService, getSyncConfigByParams, getSyncsByConnectionId, createSync, getSyncConfig, configService } from '@nangohq/shared';
import { variantSchema, connectionIdSchema, syncNameSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { getOrchestrator } from '../../utils/utils.js';
import { logContextGetter } from '@nangohq/logs';
import { envs } from '../../env.js';

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
    const body: PostSyncVariant['Body'] = parsedBody.data;
    const params: PostSyncVariant['Params'] = parsedParams.data;
    const { environment, account } = res.locals;

    if (account?.is_capped) {
        res.status(400).send({ error: { code: 'feature_disabled', message: 'Creating sync variant is only available for paying customer' } });
        return;
    }

    if (params.variant.toLowerCase() === 'base') {
        res.status(400).send({ error: { code: 'invalid_variant', message: `Variant name "${params.variant}" is protected.` } });
        return;
    }
    const { response: connection, error } = await connectionService.getConnection(body.connection_id, body.provider_config_key, environment.id);
    if (error || !connection) {
        res.status(400).send({ error: { code: 'unknown_connection' } });
        return;
    }

    const syncs = await getSyncsByConnectionId({ connectionId: connection.id });
    if (!syncs) {
        res.status(500).send({ error: { code: 'failed_sync_variant_creation' } });
        return;
    }

    const maxSyncsPerConnection = envs.MAX_SYNCS_PER_CONNECTION;
    if (syncs.length > maxSyncsPerConnection) {
        res.status(400).send({ error: { code: 'resource_capped', message: `Maximum number of syncs per connection (${maxSyncsPerConnection}) reached` } });
        return;
    }

    const existingSync = syncs.find((s) => s.name === params.name && s.variant === params.variant) || null;

    if (existingSync) {
        res.status(400).send({ error: { code: 'sync_variant_already_exists' } });
        return;
    }

    const providerConfig = await configService.getProviderConfig(body.provider_config_key, environment.id);
    if (!providerConfig) {
        res.status(400).send({ error: { code: 'unknown_provider_config' } });
        return;
    }

    const syncConfig = await getSyncConfigByParams(environment.id, params.name, body.provider_config_key);
    if (!syncConfig) {
        res.status(400).send({ error: { code: 'unknown_sync' } });
        return;
    }

    const nangoConfig = await getSyncConfig({ nangoConnection: connection as DBConnection, syncName: params.name });
    if (!nangoConfig) {
        res.status(500).send({ error: { code: 'failed_sync_variant_creation' } });
        return;
    }

    const syncData = nangoConfig.integrations[body.provider_config_key]?.[params.name];
    if (!syncData) {
        res.status(500).send({ error: { code: 'failed_sync_variant_creation' } });
        return;
    }

    const sync = await createSync({
        syncConfig: syncConfig,
        connectionId: connection.id,
        variant: params.variant
    });

    if (!sync) {
        res.status(500).send({ error: { code: 'failed_sync_variant_creation' } });
        return;
    }

    await orchestrator.scheduleSync({
        nangoConnection: connection,
        sync,
        providerConfig,
        syncName: sync.name,
        syncVariant: sync.variant,
        syncData,
        logContextGetter
    });

    res.status(200).send({
        id: sync.id,
        name: sync.name,
        variant: sync.variant
    });
});
