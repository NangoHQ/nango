import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { metrics, zodErrorToHTTP } from '@nangohq/utils';
import { connectionIdSchema, modelSchema, variantSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import type { GetPublicRecords } from '@nangohq/types';
import { connectionService, trackFetch } from '@nangohq/shared';
import { records } from '@nangohq/records';

export const validationQuery = z
    .object({
        model: modelSchema,
        variant: variantSchema.optional(),
        delta: z.string().datetime().optional(),
        modified_after: z.string().datetime().optional(),
        limit: z.coerce.number().min(1).max(10000).default(100).optional(),
        filter: z
            .string()
            .transform((value) => value.split(','))
            .pipe(z.array(z.enum(['added', 'updated', 'deleted', 'ADDED', 'UPDATED', 'DELETED'])))
            .transform<GetPublicRecords['Querystring']['filter']>((value) => value.join(',') as GetPublicRecords['Querystring']['filter'])
            .optional(),
        cursor: z.string().min(1).max(1000).optional(),
        // It's an array because external ids can contain any string which makes them more susceptible to bad encoding/decoding
        // Also it's easier to validate
        ids: z
            .union([
                z.string().min(1).max(256), // There is no diff between a normal query param and an array with one item
                z.array(z.string().min(1).max(256)).max(100)
            ])
            .transform((val) => (Array.isArray(val) ? val : [val]))
            .optional()
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

    const { environment, account } = res.locals;
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
        connectionId: connection.id,
        model: query.variant && query.variant !== 'base' ? `${query.model}::${query.variant}` : query.model,
        modifiedAfter: query.delta || query.modified_after,
        limit: query.limit,
        filter: query.filter,
        cursor: query.cursor,
        externalIds: query.ids
    });

    if (result.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch records' } });
        return;
    }

    await trackFetch(connection.id);

    res.send({
        next_cursor: result.value.next_cursor || null,
        records: result.value.records
    });

    try {
        metrics.increment(metrics.Types.GET_RECORDS_COUNT, result.value.records.length, { accountId: account.id });
        // using the response content-length header as the records size metric in order to avoid stringifying the response body
        const responseSize = parseInt(res.get('content-length') || '0');
        metrics.increment(metrics.Types.GET_RECORDS_SIZE_IN_BYTES, responseSize, { accountId: account.id });
    } catch {
        // ignore errors
    }
});
