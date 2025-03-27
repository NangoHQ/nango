import { z } from 'zod';

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
                errorMap: () => ({ message: 'Each sync must be either a string or a { name: string, variant: string } object' })
            })
        ),
        full_resync: z.boolean().optional(),
        connection_id: z.string().optional(),
        provider_config_key: z.string().optional()
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

    const provider_config_key: string | undefined = body.provider_config_key || headers['provider-config-key'];
    if (!provider_config_key) {
        res.status(400).send({ error: { code: 'missing_provider_config_key', message: 'Missing provider_config_key. Provide it in the body or headers.' } });
        return;
    }

    const connectionId: string | undefined = body.connection_id || headers['connection-id'];
    if (!connectionId) {
        res.status(400).send({ error: { code: 'missing_connection_id', message: 'Missing connection_id. Provide it in the body or headers.' } });
        return;
    }

    const { syncs, full_resync } = body;

    const syncIdentifiers = normalizeSyncParams(syncs);

    const { environment } = res.locals;

    const { success, error } = await syncManager.runSyncCommand({
        recordsService,
        orchestrator,
        environment,
        providerConfigKey: provider_config_key,
        syncIdentifiers,
        command: full_resync ? SyncCommand.RUN_FULL : SyncCommand.RUN,
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
