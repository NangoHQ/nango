import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { records as recordsService } from '@nangohq/records';
import { SyncCommand, errorManager, syncManager } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { normalizeSyncParams } from './helpers.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { PostPublicTrigger } from '@nangohq/types';

const bodyValidation = z
    .object({
        syncs: z.array(
            z.union([z.string(), z.object({ name: z.string(), variant: z.string() })], {
                error: () => ({ message: 'Each sync must be either a string or a { name: string, variant: string } object' })
            })
        ),
        sync_mode: z.enum(['incremental', 'full_refresh', 'full_refresh_and_clear_cache']).optional(),
        full_resync: z.boolean().optional(),
        connection_id: z.string().optional(),
        provider_config_key: z.string().optional(),
        opts: z
            .object({
                reset: z.boolean().optional(),
                emptyCache: z.boolean().optional()
            })
            .optional()
    })
    .strict();

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

    const { syncs, sync_mode, full_resync, opts } = body;

    const syncIdentifiers = normalizeSyncParams(syncs);

    const { environment } = res.locals;

    // Reject conflicting parameters: opts is the new API, sync_mode/full_resync are deprecated
    if (opts && (sync_mode || full_resync !== undefined)) {
        res.status(400).send({
            error: { code: 'invalid_body', message: 'Cannot use opts with deprecated sync_mode/full_resync parameters' }
        });
        return;
    }

    let command: SyncCommand;
    let deleteRecords: boolean;

    if (opts) {
        command = opts.reset ? SyncCommand.RUN_FULL : SyncCommand.RUN;
        deleteRecords = opts.emptyCache ?? false;
    } else {
        command = getCommandFromSyncModeOrFullResync(sync_mode, full_resync);
        deleteRecords = sync_mode === 'full_refresh_and_clear_cache';
    }

    const { success, error } = await syncManager.runSyncCommand({
        recordsService,
        orchestrator,
        environment,
        providerConfigKey,
        deleteRecords,
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
function getCommandFromSyncModeOrFullResync(sync_mode: PostPublicTrigger['Body']['sync_mode'] | undefined, full_resync: boolean | undefined) {
    if (sync_mode) {
        return sync_mode === 'incremental' ? SyncCommand.RUN : SyncCommand.RUN_FULL;
    }

    return full_resync ? SyncCommand.RUN_FULL : SyncCommand.RUN;
}
