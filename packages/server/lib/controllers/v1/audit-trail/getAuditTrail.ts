import * as z from 'zod';

import { InvalidAuditCursorError } from '@nangohq/audit';
import { zodErrorToHTTP } from '@nangohq/utils';

import { audit } from '../../../audit.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetAuditTrail } from '@nangohq/types';

const PAGE_SIZE = 25;

const queryStringValidation = z
    .object({
        // Private dashboard routes always carry `env`, even account-scoped ones; accept and ignore it.
        env: z.string(),
        cursor: z.string().optional(),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional()
    })
    .strict()
    // Surface an inverted range as a 400 rather than a silently empty result.
    .refine((q) => !q.from || !q.to || new Date(q.from) <= new Date(q.to), { message: '`from` must be before or equal to `to`', path: ['from'] });

export const getAuditTrail = asyncWrapper<GetAuditTrail>(async (req, res) => {
    const query = queryStringValidation.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }

    const { account } = res.locals;
    const { cursor, from, to } = query.data;

    const result = await audit.listAuditTrailEvents({ accountId: account.id, limit: PAGE_SIZE, cursor, from, to });
    if (result.isErr()) {
        if (result.error instanceof InvalidAuditCursorError) {
            res.status(400).send({ error: { code: 'invalid_query_params', message: 'Invalid cursor' } });
            return;
        }
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch audit trail events' } });
        return;
    }

    res.status(200).send({
        data: result.value.events,
        pagination: { nextCursor: result.value.nextCursor }
    });
});
