import { describe, expect, it } from 'vitest';

import { auditCsvHeader, auditCsvRows } from './csv.js';

import type { ApiAuditTrailEvent } from '@nangohq/types';

const event = (overrides: Partial<ApiAuditTrailEvent> = {}): ApiAuditTrailEvent => ({
    id: '11111111-1111-1111-1111-111111111111',
    version: '2026-07-16',
    occurredAt: '2026-01-01T00:00:00.000Z',
    accountId: 42,
    scope: 'environment',
    environment: { id: 'e0000000-0000-4000-8000-000000000001', display: 'dev' },
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
            'occurred_at,event_id,scope,environment,actor_type,actor_id,actor_display,via,via_actor_id,resource,action,target_types,target_ids,target_displays,outcome,ip,user_agent,interface,metadata'
        );
        expect(auditCsvRows([event()])).toBe(
            '2026-01-01T00:00:00.000Z,11111111-1111-1111-1111-111111111111,environment,dev,user,5,a@b.co,,,connection,deleted,connection,10,,success,1.2.3.4,curl/8,api,'
        );
    });

    it('leaves absent optional fields empty rather than writing undefined', () => {
        const row = auditCsvRows([event({ scope: 'account', environment: null, actor: { type: 'anonymous', id: 'anonymous' }, context: {}, targets: [] })]);
        expect(row).not.toContain('undefined');
        expect(row).toBe('2026-01-01T00:00:00.000Z,11111111-1111-1111-1111-111111111111,account,,anonymous,anonymous,,,,connection,deleted,,,,success,,,,');
    });

    it('keeps a target display, so the same person is not an email in one column and a bare id in another', () => {
        const row = auditCsvRows([
            event({
                resource: 'app_auth',
                action: 'login',
                targets: [{ type: 'user', id: '5', display: 'a@b.co' }]
            })
        ]);
        expect(row).toContain('dev,user,5,a@b.co,,,app_auth,login,user,5,a@b.co,success,');
    });

    it('quotes a value carrying a comma, and doubles an embedded quote', () => {
        const row = auditCsvRows([event({ actor: { type: 'user', id: '5', display: 'Last, First' }, metadata: { note: 'say "hi"' } })]);
        expect(row).toContain('"Last, First"');
        expect(row).toContain('""note""');
        expect(row.split('\n')).toHaveLength(1);
    });

    // A user agent is chosen by whoever calls the API, and a display name by whoever signs up.
    it.each(['=cmd|calc', '+1+1', '-2+3', '@SUM(A1)', '\tstart', '\r=1+1', '\n=1+1'])('keeps %j as text rather than a spreadsheet formula', (value) => {
        const row = auditCsvRows([event({ actor: { type: 'user', id: '5', display: value } })]);
        expect(row).toContain(`'${value}`);
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

    it('carries the operator id in its own cell, and never their name', () => {
        const row = auditCsvRows([event({ via: [{ type: 'impersonation', id: '1', display: 'Nango', actorId: '7' }] })]);
        expect(row).toContain(',impersonation:Nango,7,');
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
        expect(row).toContain(',connection; user,10; 7,; a@b.co,');
    });

    it('omits metadata when it is empty, so the column is not filled with {}', () => {
        expect(auditCsvRows([event({ metadata: {} })]).endsWith(',')).toBe(true);
    });
});
