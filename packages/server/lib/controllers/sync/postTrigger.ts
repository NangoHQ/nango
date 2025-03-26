import { z } from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { records as recordsService } from '@nangohq/records';
import { SyncCommand, errorManager, syncManager } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { PostTrigger } from '@nangohq/types';

const bodyValidation = z
    .object({
        syncs: z.array(
            z.union([z.string(), z.object({ name: z.string(), variant: z.string() })], {
                errorMap: () => ({ message: 'Each sync must be either a string or a { name: string, variant: string } object' })
            })
        ),
        full_resync: z.boolean(),
        connection_id: z.string().optional(),
        provider_config_key: z.string().optional()
    })
    .strict();

const headersValidation = z.object({
    'Provider-Config-Key': z.string().optional(),
    'Connection-Id': z.string().optional()
});

const orchestrator = getOrchestrator();

export const postPublicTrigger = asyncWrapper<PostTrigger>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const body = bodyValidation.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    const headers = headersValidation.safeParse(req.headers);
    if (!headers.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(headers.error) } });
        return;
    }

    const { syncs, full_resync } = body.data;

    const provider_config_key: string | undefined = body.data.provider_config_key || headers.data['Provider-Config-Key'];
    if (!provider_config_key) {
        res.status(400).send({ error: { code: 'missing_provider_config_key', message: 'Missing provider_config_key. Provide it in the body or headers.' } });
        return;
    }

    const connectionId: string | undefined = body.data.connection_id || headers.data['Connection-Id'];
    if (!connectionId) {
        res.status(400).send({ error: { code: 'missing_connection_id', message: 'Missing connection_id. Provide it in the body or headers.' } });
        return;
    }

    const syncIdentifiers = normalizedSyncParams(syncs);

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

function normalizedSyncParams(syncs: (string | { name: string; variant: string })[]): { syncName: string; syncVariant: string }[] {
    return syncs.map((sync) => {
        if (typeof sync === 'string') {
            if (sync.includes('::')) {
                const [name, variant] = sync.split('::');
                return { syncName: name ?? '', syncVariant: variant ?? '' };
            }
            return { syncName: sync, syncVariant: 'base' };
        }

        return { syncName: sync.name, syncVariant: sync.variant };
    });
}
