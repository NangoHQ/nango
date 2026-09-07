import { format } from 'date-fns';

import type { AuditExportMaxRows } from '@nangohq/types';

// Stated to the customer before an export starts, so it has to be the server's ceiling. The annotation is
// what enforces that - `@nangohq/types` ships no runtime entry, so the value cannot be imported.
export const AUDIT_EXPORT_MAX_ROWS: AuditExportMaxRows = 50_000;

const boundary = (iso: string) => format(new Date(iso), 'MMM d, HH:mm');

// Read off the boundary rather than now, so a window on the other side of a DST change still labels itself correctly.
const zone = (iso: string) => `UTC${format(new Date(iso), 'xxx')}`;

export function exportWindowField(from: string | undefined, to: string | undefined): { label: string; value: string; zone?: string } {
    if (from && to) {
        const fromZone = zone(from);
        const toZone = zone(to);
        // A window spanning a DST change has an offset per end, so one shared label would misdate the other.
        return fromZone === toZone
            ? { label: 'Window', value: `${boundary(from)} – ${boundary(to)}`, zone: fromZone }
            : { label: 'Window', value: `${boundary(from)} ${fromZone} – ${boundary(to)} ${toZone}` };
    }
    if (from) {
        return { label: 'Since', value: boundary(from), zone: zone(from) };
    }
    if (to) {
        return { label: 'Until', value: boundary(to), zone: zone(to) };
    }
    return { label: 'Window', value: 'All time' };
}
