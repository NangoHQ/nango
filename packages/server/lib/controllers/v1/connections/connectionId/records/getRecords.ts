import * as z from 'zod';

import { Cursor, records as recordsService } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
import { requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, envSchema, providerConfigKeySchema, variantSchema } from '../../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';

import type { GetConnectionRecords } from '@nangohq/types';

const paramValidation = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

const metadataOnlyQuery = z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true');

const queryStringValidation = z
    .object({
        env: envSchema,
        provider_config_key: providerConfigKeySchema,
        model: z.string().min(1).max(255),
        variant: variantSchema.optional(),
        cursor: z
            .string()
            .min(1)
            .max(1000)
            .refine((value) => Cursor.from(value) !== undefined, { message: 'Invalid cursor' })
            .optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
        metadata_only: metadataOnlyQuery,
        record_id: z.string().min(1).max(4096).optional()
    })
    .strict()
    .refine((q) => !(q.record_id && q.cursor), {
        message: 'record_id and cursor cannot be used together',
        path: ['cursor']
    });

export const getConnectionRecords = asyncWrapper<GetConnectionRecords>(async (req, res) => {
    const emptyBody = requireEmptyBody(req as any);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const queryParamValues = queryStringValidation.safeParse(req.query);
    if (!queryParamValues.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) }
        });
        return;
    }

    const paramValues = paramValidation.safeParse(req.params);
    if (!paramValues.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValues.error) }
        });
        return;
    }

    const { environment } = res.locals;
    const query = queryParamValues.data satisfies GetConnectionRecords['Querystring'];
    const params = paramValues.data satisfies GetConnectionRecords['Params'];

    const connection = await connectionService.getConnectionForPrivateApi({
        connectionId: params.connectionId,
        providerConfigKey: query.provider_config_key,
        environmentId: environment.id
    });

    if (connection.isErr()) {
        res.status(404).send({ error: { code: 'not_found', message: 'Failed to find connection' } });
        return;
    }

    const modelName = toRecordModelName(query.model, query.variant);
    const connectionPkId = connection.value.connection.id;

    if (query.record_id) {
        const records = await recordsService.getRecords({
            connectionId: connectionPkId,
            model: modelName,
            externalIds: [query.record_id],
            limit: 1,
            metadataOnly: false
        });

        if (records.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch records' } });
            return;
        }

        res.status(200).send({
            data: {
                next_cursor: null,
                records: records.value.records
            }
        });
        return;
    }

    const records = await recordsService.getRecords({
        connectionId: connectionPkId,
        model: modelName,
        cursor: query.cursor,
        limit: query.limit,
        metadataOnly: query.metadata_only,
        sort: 'desc'
    });

    if (records.isErr()) {
        if (records.error.message === 'invalid_cursor_value') {
            res.status(400).send({
                error: {
                    code: 'invalid_query_params',
                    errors: [{ code: 'custom', message: 'Invalid cursor', path: ['cursor'] }]
                }
            });
            return;
        }

        res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch records' } });
        return;
    }

    res.status(200).send({
        data: {
            next_cursor: records.value.next_cursor || null,
            records: records.value.records
        }
    });
});

function toRecordModelName(model: string, variant?: string | null) {
    if (!variant || variant === 'base') {
        return model;
    }

    return `${model}::${variant}`;
}
