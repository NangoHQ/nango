import { auditExportQuery, auditListQuery } from '../../controllers/v1/audit-trail/query.js';
import { Audit, auditable } from './auditable.js';
import { omitUndefined } from './input.js';

import type { AuditTrailFiltersMetadata, GetAuditTrail, GetAuditTrailExport } from '@nangohq/types';

export const auditTrailExported = auditable<GetAuditTrailExport>({
    policy: Audit.auditable({ resource: 'audit_trail', action: 'exported', scope: 'account' }),
    metadata: (req) => {
        const query = auditExportQuery.safeParse(req.query);
        return query.success ? auditTrailFilters(query.data) : undefined;
    }
});

export const auditTrailQueried = auditable<GetAuditTrail>({
    policy: Audit.auditable({ resource: 'audit_trail', action: 'queried', scope: 'account' }),
    // `continued` marks a page of an earlier query, so an auditor can collapse one browsing session. It is not
    // a gate: a cursor is unsigned, so letting it decide whether we record would let a reader opt out.
    metadata: (req) => {
        const query = auditListQuery.safeParse(req.query);
        return query.success ? { ...auditTrailFilters(query.data), ...(query.data.cursor ? { continued: true } : {}) } : undefined;
    }
});

// Parsed with the endpoint's own schema, so the filters recorded are the ones it accepted rather than a
// second, looser reading of the same query.
function auditTrailFilters(data: {
    from?: string | undefined;
    to?: string | undefined;
    resources?: string[] | undefined;
    actions?: string[] | undefined;
}): AuditTrailFiltersMetadata {
    return omitUndefined<AuditTrailFiltersMetadata>({ from: data.from, to: data.to, resources: data.resources, actions: data.actions }) ?? {};
}
