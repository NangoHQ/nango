import * as z from 'zod';

import { getInterval } from '@nangohq/nango-yaml';
import { configService, connectionService, getSyncAndActionConfigsBySyncNameAndConfigId, getSyncsByConnectionId, setFrequency } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, frequencySchema, providerConfigKeySchema, syncNameSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { PutPublicSyncConnectionFrequency } from '@nangohq/types';

const bodyValidation = z
    .object({
        sync_name: syncNameSchema,
        sync_variant: syncNameSchema.optional(),
        provider_config_key: providerConfigKeySchema,
        connection_id: connectionIdSchema,
        frequency: frequencySchema.nullable()
    })
    .strict();

const orchestrator = getOrchestrator();

/**
 * PUT /sync/update-connection-frequency
 *
 * Allow users to change the default frequency value of a sync without losing the value.
 * The system will store the value inside `_nango_syncs.frequency` and update the relevant schedules.
 */
export const putSyncConnectionFrequency = asyncWrapper<PutPublicSyncConnectionFrequency>(async (req, res, next) => {
    try {
        const emptyQuery = requireEmptyQuery(req);
        if (emptyQuery) {
            res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
            return;
        }

        const valBody = bodyValidation.safeParse(req.body);
        if (!valBody.success) {
            res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
            return;
        }

        const { sync_name, sync_variant, provider_config_key, connection_id, frequency }: PutPublicSyncConnectionFrequency['Body'] = valBody.data;
        const environmentId = res.locals['environment'].id;

        const getConnection = await connectionService.getConnection(connection_id, provider_config_key, environmentId);
        if (!getConnection.response || getConnection.error) {
            res.status(400).send({ error: { code: 'unknown_connection' } });
            return;
        }

        const connection = getConnection.response;

        const syncs =
            (await getSyncsByConnectionId({
                connectionId: connection.id,
                filter: [{ syncName: sync_name, syncVariant: sync_variant || 'base' }]
            })) || [];
        if (syncs.length <= 0) {
            res.status(400).send({ error: { code: 'unknown_sync' } });
            return;
        }

        const syncId = syncs[0]!.id;

        let newFrequency: string | undefined;
        if (frequency) {
            const interval = getInterval(frequency, new Date());
            if (interval instanceof Error) {
                res.status(400).send({ error: { code: 'invalid_body', message: 'Sync interval is invalid' } });
                return;
            }
            newFrequency = interval.interval;
        } else {
            const providerId = await configService.getIdByProviderConfigKey(environmentId, provider_config_key);
            const syncConfigs = await getSyncAndActionConfigsBySyncNameAndConfigId(environmentId, providerId!, sync_name);
            if (syncConfigs.length <= 0) {
                res.status(400).send({ error: { code: 'unknown_sync' } });
                return;
            }
            const selected = syncConfigs[0];
            if (!selected || !selected.runs) {
                res.status(400).send({ error: { code: 'unknown_sync' } });
                return;
            }
            newFrequency = selected.runs;
        }

        await setFrequency(syncId, frequency);

        const updated = await orchestrator.updateSyncFrequency({
            syncId,
            interval: newFrequency,
            syncName: sync_name,
            environmentId: connection.environment_id
        });
        if (updated.isErr()) {
            res.status(400).send({ error: { code: 'server_error', message: 'Failed to updated frequency' } });
            return;
        }

        res.status(200).send({ frequency: newFrequency });
    } catch (err) {
        next(err);
    }
});
