import * as z from 'zod';

import { records } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, modelSchema, providerConfigKeySchema, variantSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { PatchPublicPruneRecords } from '@nangohq/types';

export const validationBody = z
    .object({
        model: modelSchema,
        variant: variantSchema.optional(),
        until_cursor: z.string().min(1).max(1000),
        limit: z.coerce.number().min(1).max(10_000).optional()
    })
    .strict();
export const validationHeaders = z
    .object({
        'connection-id': connectionIdSchema,
        'provider-config-key': providerConfigKeySchema
    })
    .strict();

export const patchPublicPruneRecords = asyncWrapper<PatchPublicPruneRecords>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const valHeaders = validationHeaders.safeParse({ 'connection-id': req.get('connection-id'), 'provider-config-key': req.get('provider-config-key') });
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }

    const { environment } = res.locals;
    const headers: PatchPublicPruneRecords['Headers'] = valHeaders.data;
    const body: PatchPublicPruneRecords['Body'] = valBody.data;

    const { error, response: connection } = await connectionService.getConnection(headers['connection-id'], headers['provider-config-key'], environment.id);

    if (error || !connection) {
        res.status(400).send({
            error: { code: 'unknown_connection', message: 'Provided ConnectionId and ProviderConfigKey does not match a valid connection' }
        });
        return;
    }

    const model = body.variant && body.variant !== 'base' ? `${body.model}::${body.variant}` : body.model;
    const result = await records.deleteRecords({
        environmentId: environment.id,
        connectionId: connection.id,
        model,
        mode: 'prune',
        limit: body.limit || 1000,
        batchSize: 1000,
        toCursorIncluded: body.until_cursor
    });

    if (result.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to prune records' } });
        return;
    }

    // IMPORTANT:
    // if until_cursor doesn't exist anymore (e.g. records was updated or deleted)
    // we can't be sure if there are more records to prune
    // so we optimistically return has_more = true in that case
    // This may lead to one extra call to this endpoint
    // but ensures all records are pruned as expected
    // without extra code/query to maintain and execute on every request
    const hasMore = result.value.count > 0 && body.until_cursor !== result.value.lastCursor;

    res.send({
        count: result.value.count,
        has_more: hasMore
    });
});
