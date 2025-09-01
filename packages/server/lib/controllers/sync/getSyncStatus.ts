import * as z from 'zod';

import { records as recordsService } from '@nangohq/records';
import { connectionService, getSyncsByConnectionId, getSyncsByProviderConfigKey, normalizedSyncParams, syncManager } from '@nangohq/shared';
import { Ok, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { DBConnectionDecrypted, GetPublicSyncStatus } from '@nangohq/types';

const orchestrator = getOrchestrator();

const querySchema = z.strictObject({
    syncs: z.string(),
    provider_config_key: providerConfigKeySchema,
    connection_id: connectionIdSchema.optional()
});

export const getPublicSyncStatus = asyncWrapper<GetPublicSyncStatus>(async (req, res) => {
    const parsedQuery = querySchema.safeParse(req.query);
    if (!parsedQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(parsedQuery.error) } });
        return;
    }

    const { syncs, provider_config_key, connection_id }: GetPublicSyncStatus['Querystring'] = parsedQuery.data;

    let syncIdentifiers = syncs === '*' ? Ok([]) : normalizedSyncParams(typeof syncs === 'string' ? syncs.split(',') : syncs);
    if (syncIdentifiers.isErr()) {
        res.status(400).send({ error: { code: 'invalid_body', message: syncIdentifiers.error.message } });
        return;
    }

    const environmentId = res.locals['environment'].id;

    let connection: DBConnectionDecrypted | null = null;

    if (connection_id) {
        const connectionResult = await connectionService.getConnection(connection_id, provider_config_key, environmentId);
        const { success: connectionSuccess } = connectionResult;
        if (!connectionSuccess || !connectionResult.response) {
            res.status(400).json({ error: { code: 'invalid_body', message: 'Connection not found' } });
            return;
        }

        connection = connectionResult.response;
    }

    if (syncIdentifiers.value.length <= 0) {
        if (connection && connection.id) {
            const syncs = await getSyncsByConnectionId({ connectionId: connection.id });
            if (syncs) {
                syncIdentifiers = Ok(syncs.map((sync) => ({ syncName: sync.name, syncVariant: sync.variant })));
            }
        } else {
            const syncs = await getSyncsByProviderConfigKey({ environmentId, providerConfigKey: provider_config_key });
            if (syncs) {
                syncIdentifiers = Ok(syncs.map((sync) => ({ syncName: sync.name, syncVariant: sync.variant })));
            }
        }
    }

    if (syncIdentifiers.isErr()) {
        res.status(400).send({ error: { code: 'invalid_body', message: `syncs parameter is invalid` } });
        return;
    }

    const { success, response: syncsWithStatus } = await syncManager.getSyncStatus({
        environmentId,
        providerConfigKey: provider_config_key,
        syncIdentifiers: syncIdentifiers.value,
        orchestrator,
        recordsService,
        connectionId: connection_id as string,
        includeJobStatus: false,
        optionalConnection: connection
    });

    if (!success || !syncsWithStatus) {
        res.status(400).json({ error: { code: 'invalid_body', message: 'Failed to get sync status' } });
        return;
    }

    res.send({ syncs: syncsWithStatus });
});
