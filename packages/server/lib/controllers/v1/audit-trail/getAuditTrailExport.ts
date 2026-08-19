import { zodErrorToHTTP } from '@nangohq/utils';

import { audit } from '../../../audit.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { canAccessAuditTrail } from '../../../utils/auditTrail.js';
import { auditExportQuery } from './query.js';

import type { GetAuditTrailExport } from '@nangohq/types';

const PAGE_SIZE = 10_000;

/**
 * The response is built in one request, so the ceiling is what the load balancer's 90s timeout allows with
 * room to spare, not what the store can serve. An export that reaches it is truncated rather than failed,
 * and says so in the header, because a partial year is more useful than an error.
 */
export const MAX_EXPORT_ROWS = 50_000;

export const TRUNCATED_HEADER = 'x-nango-audit-export-truncated';

function fileName(from: string | undefined, to: string | undefined): string {
    const day = (value: string | undefined) => (value ? value.slice(0, 10) : null);
    const window = [day(from), day(to)].filter(Boolean).join('_to_');
    return window ? `nango-audit-trail_${window}.csv` : 'nango-audit-trail.csv';
}

export const getAuditTrailExport = asyncWrapper<GetAuditTrailExport>(async (req, res) => {
    const { account, plan } = res.locals;
    if (!(await canAccessAuditTrail(account.uuid, plan))) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'Audit trail is not enabled for this account' } });
        return;
    }

    const query = auditExportQuery.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }

    const { from, to, resources, actions } = query.data;

    const result = await audit.exportCsv({ accountId: account.id, maxRows: MAX_EXPORT_ROWS, pageSize: PAGE_SIZE, from, to, resources, actions });
    if (result.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to export audit trail events' } });
        return;
    }

    res.status(200)
        .type('text/csv')
        .setHeader('Content-Disposition', `attachment; filename="${fileName(from, to)}"`)
        .setHeader(TRUNCATED_HEADER, String(result.value.truncated))
        .end(result.value.csv);
});
