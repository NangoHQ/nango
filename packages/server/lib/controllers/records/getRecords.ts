import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import { connectionIdSchema, modelSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import type { GetPublicRecords } from '@nangohq/types';
import { connectionService, trackFetch } from '@nangohq/shared';
import { records } from '@nangohq/records';

export const validationQuery = z
    .object({
        model: modelSchema,
        delta: z.string().datetime().optional(),
        modified_after: z.string().datetime().optional(),
        limit: z.coerce.number().min(1).max(10000).default(100).optional(),
        filter: z.enum(['added', 'updated', 'deleted']).optional(),
        cursor: z.string().min(1).max(1000).optional()
    })
    .strict();
export const validationHeaders = z
    .object({
        'connection-id': connectionIdSchema,
        'provider-config-key': providerConfigKeySchema
    })
    .strict();

export const getPublicRecords = asyncWrapper<GetPublicRecords>(async (req, res) => {
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
    const headers: GetPublicRecords['Headers'] = valHeaders.data;
    const query: GetPublicRecords['Querystring'] = valQuery.data;

    const { error, response: connection } = await connectionService.getConnection(headers['connection-id'], headers['provider-config-key'], environment.id);

    if (error || !connection) {
        res.status(400).send({
            error: { code: 'unknown_connection', message: 'Provided ConnectionId and ProviderConfigKey does not match a valid connection' }
        });
        return;
    }

    const result = await records.getRecords({
        connectionId: connection.id!,
        model: query.model,
        modifiedAfter: query.delta || query.modified_after,
        limit: query.limit,
        filter: query.filter,
        cursor: query.cursor
    });

    if (result.isErr()) {
        console.log(result.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch records' } });
        return;
    }

    await trackFetch(connection.id!);
    res.send({
        next_cursor: result.value.next_cursor || null,
        records: result.value.records
    });
});
