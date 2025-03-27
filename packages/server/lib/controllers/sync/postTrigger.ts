import { z } from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { records as recordsService } from '@nangohq/records';
import { SyncCommand, errorManager, syncManager } from '@nangohq/shared';
import { SyncMode } from '@nangohq/types/lib/sync/index.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { normalizeSyncParams } from './helpers.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { PostPublicTrigger } from '@nangohq/types';

const bodyValidation = z
    .object({
        syncs: z.array(
            z.union([z.string(), z.object({ name: z.string(), variant: z.string() })], {
                errorMap: () => ({ message: 'Each sync must be either a string or a { name: string, variant: string } object' })
            })
        ),
        sync_mode: z.string().toUpperCase().pipe(z.nativeEnum(SyncMode)).optional(),
        full_resync: z.boolean().optional(),
        connection_id: z.string().optional(),
        provider_config_key: z.string().optional()
    })
    .strict()
    // Either sync_mode or full_resync is required. Error message incentive to use sync_mode.
    .refine(
        (input) => {
            if (input.sync_mode === undefined && input.full_resync === undefined) {
                return false;
            }
            return true;
        },
        { message: 'sync_mode is required' }
    );

const headersValidation = z.object({
    'provider-config-key': z.string().optional(),
    'connection-id': z.string().optional()
});

const orchestrator = getOrchestrator();

export const postPublicTrigger = asyncWrapper<PostPublicTrigger>(async (req, res) => {
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

    const valHeaders = headersValidation.safeParse({
        'provider-config-key': req.get('provider-config-key'),
        'connection-id': req.get('connection-id')
    });
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }

    const body: PostPublicTrigger['Body'] = valBody.data;
    const headers: PostPublicTrigger['Headers'] = valHeaders.data;

    const providerConfigKey: string | undefined = body.provider_config_key || headers['provider-config-key'];
    if (!providerConfigKey) {
        res.status(400).send({ error: { code: 'missing_provider_config_key', message: 'Missing provider_config_key. Provide it in the body or headers.' } });
        return;
    }

    const connectionId: string | undefined = body.connection_id || headers['connection-id'];
    if (!connectionId) {
        res.status(400).send({ error: { code: 'missing_connection_id', message: 'Missing connection_id. Provide it in the body or headers.' } });
        return;
    }

    const { syncs, sync_mode, full_resync } = body;

    const syncIdentifiers = normalizeSyncParams(syncs);

    const { environment } = res.locals;

    const command = getCommandFromSyncModeOrFullResync(sync_mode, full_resync);
    const shouldDeleteRecords = sync_mode === SyncMode.FULL_REFRESH_AND_CLEAR_CACHE;

    const { success, error } = await syncManager.runSyncCommand({
        recordsService,
        orchestrator,
        environment,
        providerConfigKey,
        deleteRecords: shouldDeleteRecords,
        syncIdentifiers,
        command,
        logContextGetter,
        connectionId,
        initiator: 'API call'
    });

    if (!success) {
        errorManager.errResFromNangoErr(res, error);
        return;
    }

    res.status(200).send({ success: true });
});

/**
 * Uses sync_mode if provided, otherwise uses full_resync. full_resync is deprecated but maintained for backwards compatibility.
 */
function getCommandFromSyncModeOrFullResync(sync_mode: SyncMode | undefined, full_resync: boolean | undefined) {
    if (sync_mode) {
        return sync_mode === SyncMode.INCREMENTAL ? SyncCommand.RUN : SyncCommand.RUN_FULL;
    }

    return full_resync ? SyncCommand.RUN_FULL : SyncCommand.RUN;
}
