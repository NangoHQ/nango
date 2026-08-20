import { describe, expect, it } from 'vitest';

import { auditCsvHeader, auditCsvRows } from './csv.js';

import type { ApiAuditTrailEvent } from '@nangohq/types';

const event = (overrides: Partial<ApiAuditTrailEvent> = {}): ApiAuditTrailEvent => ({
    id: '11111111-1111-1111-1111-111111111111',
    version: '2026-07-16',
    occurredAt: '2026-01-01T00:00:00.000Z',
    accountId: 42,
    environment: { id: 2, display: 'dev' },
    actor: { type: 'user', id: '5', display: 'a@b.co' },
    resource: 'connection',
    action: 'deleted',
    targets: [{ type: 'connection', id: '10' }],
    context: { ip: '1.2.3.4', userAgent: 'curl/8', interface: 'api' },
    outcome: 'success',
    ...overrides
});

describe('auditCsvRows', () => {
    it('writes one row per event, in the header order', () => {
        expect(auditCsvHeader()).toBe(
            'occurred_at,event_id,resource,action,outcome,actor_type,actor_id,actor_display,via,environment,targets,ip,user_agent,interface,metadata'
        );
        expect(auditCsvRows([event()])).toBe(
            '2026-01-01T00:00:00.000Z,11111111-1111-1111-1111-111111111111,connection,deleted,success,user,5,a@b.co,,dev,connection:10,1.2.3.4,curl/8,api,'
        );
    });

    it('leaves absent optional fields empty rather than writing undefined', () => {
        const row = auditCsvRows([event({ environment: null, actor: { type: 'anonymous', id: 'anonymous' }, context: {}, targets: [] })]);
        expect(row).not.toContain('undefined');
        expect(row).toBe('2026-01-01T00:00:00.000Z,11111111-1111-1111-1111-111111111111,connection,deleted,success,anonymous,anonymous,,,,,,,,');
    });

    it('quotes a value carrying a comma, and doubles an embedded quote', () => {
        const row = auditCsvRows([event({ actor: { type: 'user', id: '5', display: 'Last, First' }, metadata: { note: 'say "hi"' } })]);
        expect(row).toContain('"Last, First"');
        expect(row).toContain('""note""');
        expect(row.split('\n')).toHaveLength(1);
    });

    // A user agent is chosen by whoever calls the API, and a display name by whoever signs up.
    it.each(['=cmd|calc', '+1+1', '-2+3', '@SUM(A1)', '\tstart'])('keeps %s as text rather than a spreadsheet formula', (value) => {
        const row = auditCsvRows([event({ actor: { type: 'user', id: '5', display: value } })]);
        expect(row).toContain(`'${value}`.replace('\t', '\t'));
        expect(row.includes(`,${value},`)).toBe(false);
    });

    it('quotes a newline so one event cannot become two rows', () => {
        const row = auditCsvRows([event({ actor: { type: 'api_key', id: '1', display: 'key\nname' } })]);
        expect(row.split('\n')).toHaveLength(2);
        expect(row).toContain('"key\nname"');
    });

    it('names the impersonating party in the via cell', () => {
        const row = auditCsvRows([event({ via: [{ type: 'impersonation', id: '1', display: 'Nango' }] })]);
        expect(row).toContain(',impersonation:Nango,');
    });

    it('joins several targets into one cell', () => {
        const row = auditCsvRows([
            event({
                targets: [
                    { type: 'connection', id: '10' },
                    { type: 'user', id: '7', display: 'a@b.co' }
                ]
            })
        ]);
        expect(row).toContain(',connection:10; user:7,');
    });

    it('omits metadata when it is empty, so the column is not filled with {}', () => {
        expect(auditCsvRows([event({ metadata: {} })]).endsWith(',')).toBe(true);
    });
});
