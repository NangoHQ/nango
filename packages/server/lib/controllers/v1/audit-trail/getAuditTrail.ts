import { InvalidAuditCursorError } from '@nangohq/audit';
import { getLogger, zodErrorToHTTP } from '@nangohq/utils';

import { audit } from '../../../audit.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { canViewAuditTrail } from '../../../utils/auditTrail.js';
import { auditListQuery } from './query.js';

import type { GetAuditTrail } from '@nangohq/types';

const logger = getLogger('AuditTrail');

const PAGE_SIZE = 25;

export const getAuditTrail = asyncWrapper<GetAuditTrail>(async (req, res) => {
    const { account, plan } = res.locals;
    // Checked ahead of validation: an unentitled account has no trail to read, whatever it asks for.
    if (!(await canViewAuditTrail(req, account.uuid, plan))) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'Audit trail is not enabled for this account' } });
        return;
    }

    const query = auditListQuery.safeParse(req.query);
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

    // First page only — the total can't change while the filters are fixed, and a failed count costs the
    // reader the number rather than the rows.
    let total: number | undefined;
    if (!cursor) {
        const counted = await audit.countAuditTrailEvents({ accountId: account.id, from, to, resources, actions });
        if (counted.isErr()) {
            logger.warning(`failed to count audit trail events`, { accountId: account.id, error: counted.error });
        } else {
            total = counted.value;
        }
    }

    res.status(200).send({
        data: result.value.events,
        ...(total !== undefined && { total }),
        pagination: { nextCursor: result.value.nextCursor }
    });
});
