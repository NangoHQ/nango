import { getLogger, zodErrorToHTTP } from '@nangohq/utils';

import { audit } from '../../../audit.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { canAccessAuditTrail } from '../../../utils/auditTrail.js';
import { auditExportQuery } from './query.js';

import type { GetAuditTrailExport } from '@nangohq/types';

export const TRUNCATED_HEADER = 'x-nango-audit-export-truncated';

const logger = getLogger('AuditTrailExport');

const FILE_NAME = 'nango-audit-trail.csv';

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

    const result = await audit.exportCsv({ accountId: account.id, from, to, resources, actions });
    if (result.isErr()) {
        logger.error(`failed to export audit trail events`, { accountId: account.id, error: result.error });
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to export audit trail events' } });
        return;
    }

    res.status(200)
        .type('text/csv')
        .setHeader('Content-Disposition', `attachment; filename="${FILE_NAME}"`)
        .setHeader(TRUNCATED_HEADER, String(result.value.truncated))
        .end(result.value.csv);
});
