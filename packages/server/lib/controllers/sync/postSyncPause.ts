import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { records as recordsService } from '@nangohq/records';
import { SyncCommand, normalizedSyncParams, syncManager } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { PostPublicSyncPause } from '@nangohq/types';

const orchestrator = getOrchestrator();

const bodySchema = z.strictObject({
    syncs: z
        .array(z.union([z.string(), z.object({ name: z.string(), variant: z.string() })]))
        .min(1)
        .max(256),
    provider_config_key: providerConfigKeySchema,
    connection_id: connectionIdSchema
});

export const postPublicSyncPause = asyncWrapper<PostPublicSyncPause>(async (req, res) => {
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(parsedBody.error) } });
        return;
    }

    const body: PostPublicSyncPause['Body'] = parsedBody.data;

    const syncIdentifiers = normalizedSyncParams(body.syncs);
    if (syncIdentifiers.isErr()) {
        res.status(400).send({ error: { code: 'invalid_body', message: syncIdentifiers.error.message } });
        return;
    }

    const { environment } = res.locals;

    const resSyncCommand = await syncManager.runSyncCommand({
        recordsService,
        orchestrator,
        environment,
        providerConfigKey: body.provider_config_key,
        syncIdentifiers: syncIdentifiers.value,
        command: SyncCommand.PAUSE,
        logContextGetter,
        connectionId: body.connection_id,
        initiator: 'API call'
    });
    if (!resSyncCommand.success) {
        res.status(500).send({ error: { code: 'server_error', message: 'failed to pause syncs', errors: [resSyncCommand.error!] } });
        return;
    }

    res.status(200).send({ success: true });
});
