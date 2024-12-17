import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { PatchFlowFrequency } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { configService, getSyncConfigById, getSyncsBySyncConfigId, updateFrequency } from '@nangohq/shared';
import { validationBody as validationBodyBase, validationParams } from './patchDisable.js';
import { getOrchestrator } from '../../../../utils/utils.js';
import { z } from 'zod';

const orchestrator = getOrchestrator();
export const validationBody = validationBodyBase.extend({
    // To sync with ScriptSettings
    // Test: https://regex101.com/r/gJBaKt
    frequency: z
        .string()
        .regex(
            /^(?<every>every )?((?<amount>[0-9]+)?\s?(?<unit>(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?))|(?<unit2>(month|week|half day|half hour|quarter hour)))$/
        )
});

export const patchFlowFrequency = asyncWrapper<PatchFlowFrequency>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) }
        });
        return;
    }

    const val = validationBody.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const body: PatchFlowFrequency['Body'] = val.data;
    const { environment } = res.locals;

    const syncConfig = await getSyncConfigById(environment.id, valParams.data.id);
    if (!syncConfig) {
        res.status(400).send({ error: { code: 'unknown_sync_config' } });
        return;
    }

    const config = await configService.getIdByProviderConfigKey(environment.id, body.providerConfigKey);
    if (!config) {
        res.status(400).send({ error: { code: 'unknown_provider' } });
        return;
    }

    const syncs = await getSyncsBySyncConfigId(environment.id, valParams.data.id);
    for (const sync of syncs) {
        const updated = await orchestrator.updateSyncFrequency({
            syncId: sync.id,
            interval: body.frequency,
            syncName: sync.name,
            environmentId: environment.id
        });

        if (updated.isErr()) {
            res.status(500).send({ error: { code: 'failed_to_update_frequency', message: `Sync ${sync.id} failed` } });
            return;
        }
    }

    const updated = await updateFrequency(valParams.data.id, body.frequency);

    if (updated > 0) {
        res.status(200).send({ data: { success: true } });
    } else {
        res.status(400).send({ data: { success: false } });
    }
});
