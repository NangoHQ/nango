import * as z from 'zod';

import { records } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, modelSchema, providerConfigKeySchema, variantSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { DeletePublicRecords } from '@nangohq/types';

export const validationQuery = z
    .object({
        model: modelSchema,
        variant: variantSchema.optional(),
        mode: z.enum(['soft', 'hard']),
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

export const deletePublicRecords = asyncWrapper<DeletePublicRecords>(async (req, res) => {
    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const valHeaders = validationHeaders.safeParse({ 'connection-id': req.get('connection-id'), 'provider-config-key': req.get('provider-config-key') });
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }

    const { environment } = res.locals;
    const headers: DeletePublicRecords['Headers'] = valHeaders.data;
    const query: DeletePublicRecords['Querystring'] = valQuery.data;

    const { error, response: connection } = await connectionService.getConnection(headers['connection-id'], headers['provider-config-key'], environment.id);

    if (error || !connection) {
        res.status(400).send({
            error: { code: 'unknown_connection', message: 'Provided ConnectionId and ProviderConfigKey does not match a valid connection' }
        });
        return;
    }

    const model = query.variant && query.variant !== 'base' ? `${query.model}::${query.variant}` : query.model;
    const result = await records.deleteRecords({
        environmentId: environment.id,
        connectionId: connection.id,
        model,
        mode: query.mode,
        limit: query.limit || 1000,
        batchSize: 1000,
        toCursorIncluded: query.until_cursor
    });

    if (result.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to delete records' } });
        return;
    }

    // IMPORTANT:
    // if until_cursor doesn't exist anymore (e.g. records was updated or deleted)
    // we can't be sure if there are more records to delete
    // so we optimistically return has_more = true in that case
    // This may lead to one extra call to this endpoint
    // but ensures all records are deleted as expected
    // without extra code/query to maintain and execute on every request
    const hasMore = result.value.totalDeletedRecords > 0 && query.until_cursor !== result.value.lastDeletedCursor;

    res.send({
        count: result.value.totalDeletedRecords,
        has_more: hasMore
    });
});
