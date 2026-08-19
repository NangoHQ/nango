import { formatDateToLogFormat } from '../../utils/utils';

import type { AuditAction, AuditResource } from '@nangohq/types';

// Mirrors the server ceiling in getAuditTrailExport, shown before the customer starts an export.
export const MAX_EXPORT_ROWS = 50_000;

export function exportWindowLabel(from: string | undefined, to: string | undefined): string {
    if (from && to) {
        return `${formatDateToLogFormat(from)} to ${formatDateToLogFormat(to)}`;
    }
    if (from) {
        return `since ${formatDateToLogFormat(from)}`;
    }
    return 'the full retention window';
}

export function exportFilterLabel(resources: AuditResource[], actions: AuditAction[]): string {
    if (!resources.length) {
        return 'all resources';
    }
    const resourceLabel = resources.join(', ');
    return actions.length ? `${resourceLabel} (${actions.join(', ')})` : resourceLabel;
}
