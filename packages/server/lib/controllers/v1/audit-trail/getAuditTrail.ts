import * as z from 'zod';

import { InvalidAuditCursorError } from '@nangohq/audit';
import { zodErrorToHTTP } from '@nangohq/utils';

import { audit } from '../../../audit.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { canAccessAuditTrail } from '../../../utils/auditTrail.js';

import type { GetAuditTrail } from '@nangohq/types';

const PAGE_SIZE = 25;

const MAX_FILTER_VALUES = 50;

// Comma-separated list (`?resources=a,b`). Safe to split on a comma because both vocabularies are
// snake_case identifiers. Unlike the enum-valued query params elsewhere the values aren't checked
// against a vocabulary — the audit one has no runtime form — so an unknown value matches nothing.
const csvParam = z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(z.string().min(1)).max(MAX_FILTER_VALUES));

const queryStringValidation = z
    .object({
        cursor: z.string().optional(),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
        resources: csvParam.optional(),
        actions: csvParam.optional()
    })
    // Account-scoped endpoint (no `env`). Not strict: any stray query param is stripped rather than 400'd, so a read never fails over an extra key.
    // Surface an inverted range as a 400 rather than a silently empty result.
    .refine((q) => !q.from || !q.to || new Date(q.from) <= new Date(q.to), { message: '`from` must be before or equal to `to`', path: ['from'] })
    // An action is only meaningful attached to a resource, so reject the pairless form rather than
    // dropping it and returning a wider result set than the caller asked for.
    .refine((q) => !q.actions?.length || Boolean(q.resources?.length), { message: '`actions` requires `resources`', path: ['actions'] });

export const getAuditTrail = asyncWrapper<GetAuditTrail>(async (req, res) => {
    const { account, plan } = res.locals;
    // Checked ahead of validation: an unentitled account has no trail to read, whatever it asks for.
    if (!(await canAccessAuditTrail(account.uuid, plan))) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'Audit trail is not enabled for this account' } });
        return;
    }

    const query = queryStringValidation.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }

    const { cursor, from, to, resources, actions } = query.data;

    const result = await audit.listAuditTrailEvents({ accountId: account.id, limit: PAGE_SIZE, cursor, from, to, resources, actions });
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
