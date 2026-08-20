import type { ApiAuditTrailEvent } from '@nangohq/types';

const COLUMNS = [
    'occurred_at',
    'event_id',
    'resource',
    'action',
    'outcome',
    'actor_type',
    'actor_id',
    'actor_display',
    'environment',
    'targets',
    'ip',
    'user_agent',
    'interface',
    'metadata'
] as const;

// RFC 4180: only quote when the value would otherwise break the row, and escape a quote by doubling it.
function cell(value: string | undefined): string {
    if (!value) {
        return '';
    }
    return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function row(values: (string | undefined)[]): string {
    return values.map(cell).join(',');
}

export function auditCsvHeader(): string {
    return COLUMNS.join(',');
}

/** One line per event, no trailing newline — the caller joins pages. */
export function auditCsvRows(events: ApiAuditTrailEvent[]): string {
    return events
        .map((event) =>
            row([
                event.occurredAt,
                event.id,
                event.resource,
                event.action,
                event.outcome,
                event.actor.type,
                event.actor.id,
                event.actor.display,
                event.environment?.display,
                event.targets.map((target) => `${target.type}:${target.id}`).join('; '),
                event.context.ip,
                event.context.userAgent,
                event.context.interface,
                event.metadata && Object.keys(event.metadata).length > 0 ? JSON.stringify(event.metadata) : undefined
            ])
        )
        .join('\n');
}
