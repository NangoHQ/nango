import { formatDateToLogFormat } from '../../utils/utils';

import type { AuditAction, AuditExportMaxRows, AuditResource } from '@nangohq/types';

// Stated to the customer before an export starts, so it has to be the server's ceiling. The annotation is
// what enforces that - `@nangohq/types` ships no runtime entry, so the value cannot be imported.
export const AUDIT_EXPORT_MAX_ROWS: AuditExportMaxRows = 50_000;

export function exportWindowLabel(from: string | undefined, to: string | undefined): string {
    if (from && to) {
        return `${formatDateToLogFormat(from)} to ${formatDateToLogFormat(to)}`;
    }
    if (from) {
        return `since ${formatDateToLogFormat(from)}`;
    }
    if (to) {
        return `up to ${formatDateToLogFormat(to)}`;
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
