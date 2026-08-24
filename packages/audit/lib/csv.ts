import type { ApiAuditTrailEvent } from '@nangohq/types';

// Name and value together, so a column cannot be added, removed or reordered in one place and not the other.
const COLUMNS: { name: string; of: (event: ApiAuditTrailEvent) => string | undefined }[] = [
    { name: 'occurred_at', of: (event) => event.occurredAt },
    { name: 'event_id', of: (event) => event.id },
    { name: 'resource', of: (event) => event.resource },
    { name: 'action', of: (event) => event.action },
    { name: 'outcome', of: (event) => event.outcome },
    { name: 'actor_type', of: (event) => event.actor.type },
    { name: 'actor_id', of: (event) => event.actor.id },
    { name: 'actor_display', of: (event) => event.actor.display },
    { name: 'via', of: (event) => event.via?.map((via) => `${via.type}:${via.display ?? via.id}`).join('; ') },
    { name: 'via_actor_id', of: (event) => event.via?.map((via) => via.actorId ?? '').join('; ') || undefined },
    { name: 'environment', of: (event) => event.environment?.display },
    { name: 'targets', of: (event) => event.targets.map((target) => `${target.type}:${target.id}`).join('; ') },
    { name: 'ip', of: (event) => event.context.ip },
    { name: 'user_agent', of: (event) => event.context.userAgent },
    { name: 'interface', of: (event) => event.context.interface },
    { name: 'metadata', of: (event) => (event.metadata && Object.keys(event.metadata).length > 0 ? JSON.stringify(event.metadata) : undefined) }
];

// A spreadsheet treats a cell starting with one of these as a formula, and several of these columns carry
// values a caller chooses — a display name, a user agent. Prefixing an apostrophe keeps it text.
const FORMULA_START = /^[=+\-@\t\r\n]/;
const NEEDS_QUOTING = /[",\r\n]/;

// RFC 4180: only quote when the value would otherwise break the row, and escape a quote by doubling it.
function cell(value: string | undefined): string {
    if (!value) {
        return '';
    }
    const safe = FORMULA_START.test(value) ? `'${value}` : value;
    return NEEDS_QUOTING.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function auditCsvHeader(): string {
    return COLUMNS.map((column) => column.name).join(',');
}

/** One line per event, no trailing newline — the caller joins pages. */
export function auditCsvRows(events: ApiAuditTrailEvent[]): string {
    return events.map((event) => COLUMNS.map((column) => cell(column.of(event))).join(',')).join('\n');
}
