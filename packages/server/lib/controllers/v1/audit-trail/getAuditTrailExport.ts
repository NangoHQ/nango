import { zodErrorToHTTP } from '@nangohq/utils';

import { audit } from '../../../audit.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { canAccessAuditTrail } from '../../../utils/auditTrail.js';
import { auditExportQuery } from './query.js';

import type { AuditExportMaxRows, GetAuditTrailExport } from '@nangohq/types';

const PAGE_SIZE = 10_000;

// Bounded by the load balancer's 90s timeout rather than by what the store can serve, since the response is
// built during the request. What happens at the ceiling is `exportCsv`'s contract.
const MAX_EXPORT_ROWS: AuditExportMaxRows = 50_000;

export const TRUNCATED_HEADER = 'x-nango-audit-export-truncated';

// A one-sided window is named for the side it has: `2026-08-15` alone would read as a single day, and would
// name a `to`-only export identically to a `from`-only one.
function fileName(from: string | undefined, to: string | undefined): string {
    const day = (value: string) => value.slice(0, 10);
    if (from && to) {
        return `nango-audit-trail_${day(from)}_to_${day(to)}.csv`;
    }
    if (from) {
        return `nango-audit-trail_since_${day(from)}.csv`;
    }
    if (to) {
        return `nango-audit-trail_until_${day(to)}.csv`;
    }
    return 'nango-audit-trail.csv';
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
