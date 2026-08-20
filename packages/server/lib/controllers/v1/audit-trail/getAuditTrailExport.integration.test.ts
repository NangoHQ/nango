import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { auditClickhouseClient, AuditClient, ClickhouseAuditStore, migrate } from '@nangohq/audit';
import * as featureFlags from '@nangohq/feature-flags';
import { seeders } from '@nangohq/shared';

import { authenticateUser, isError, runServer } from '../../../utils/tests.js';
import { TRUNCATED_HEADER } from './getAuditTrailExport.js';

import type { AuditEvent, AuditResourceAction } from '@nangohq/audit';

let api: Awaited<ReturnType<typeof runServer>>;
let auditClient: ReturnType<typeof auditClickhouseClient>;
let emitter: AuditClient;

async function authAdmin({ entitled = true }: { entitled?: boolean } = {}) {
    const { account, user } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_access: entitled } });
    const session = await authenticateUser(api, user);
    return { session, account };
}

// The table TTLs on `occurred_at`, so fixtures are anchored to now — a hardcoded date silently ages out of
// the retention window and the row is gone before the test reads it.
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

function auditEvent(accountId: number, occurredAt: string, resourceAction: AuditResourceAction = { resource: 'connection', action: 'deleted' }): AuditEvent {
    return {
        occurredAt,
        accountId,
        environment: { id: 2, display: 'dev' },
        actor: { type: 'user', id: '5', display: 'a@b.co' },
        targets: [{ type: 'connection', id: '10' }],
        context: { ip: '1.2.3.4', userAgent: 'curl/8' },
        outcome: 'success',
        ...resourceAction
    };
}

// `api.fetch` parses every body as JSON, which a CSV response is not.
async function exportCsv(session: string, query: Record<string, string> = {}) {
    const url = new URL(`${api.url}/api/v1/audit-trail/export`);
    for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
    }
    const res = await fetch(url, { method: 'GET', headers: { Cookie: session } });
    return { res, body: await res.text() };
}

describe('GET /api/v1/audit-trail/export', () => {
    beforeAll(async () => {
        api = await runServer();
        (await migrate({ clickhouseUrl: process.env['CLICKHOUSE_URL']! })).unwrap();
        auditClient = auditClickhouseClient(process.env['CLICKHOUSE_URL']!);
        const store = new ClickhouseAuditStore(auditClient);
        emitter = new AuditClient(store, store);
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(true);
    });

    afterAll(async () => {
        api.server.close();
        vi.restoreAllMocks();
        await auditClient.close();
    });

    it('rejects an account that is not entitled to the audit trail with 403', async () => {
        const { session } = await authAdmin({ entitled: false });
        const res = await api.fetch('/api/v1/audit-trail/export', { method: 'GET', session, query: {} });

        expect(res.res.status).toBe(403);
        isError(res.json);
        expect(res.json.error.code).toBe('feature_disabled');
    });

    it('rejects an inverted from/to range with 400', async () => {
        const { session } = await authAdmin();
        const res = await api.fetch('/api/v1/audit-trail/export', {
            method: 'GET',
            session,
            query: { from: daysAgo(1), to: daysAgo(2) }
        });

        expect(res.res.status).toBe(400);
    });

    it('rejects an action filter with no resource with 400, as the list endpoint does', async () => {
        const { session } = await authAdmin();
        const res = await api.fetch('/api/v1/audit-trail/export', { method: 'GET', session, query: { actions: 'deleted' } });

        expect(res.res.status).toBe(400);
    });

    it('returns the account events as a CSV attachment, most-recent first', async () => {
        const { session, account } = await authAdmin();
        (await emitter.record(auditEvent(account.id, daysAgo(2)))).unwrap();
        (await emitter.record(auditEvent(account.id, daysAgo(1), { resource: 'sync', action: 'paused' }))).unwrap();

        const { res, body } = await exportCsv(session);

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/csv');
        expect(res.headers.get('content-disposition')).toBe('attachment; filename="nango-audit-trail.csv"');
        expect(res.headers.get(TRUNCATED_HEADER)).toBe('false');

        const lines = body.trim().split('\n');
        expect(lines[0]).toBe(
            'occurred_at,event_id,resource,action,outcome,actor_type,actor_id,actor_display,environment,targets,ip,user_agent,interface,metadata'
        );
        expect(lines).toHaveLength(3);
        // Most-recent first, and the row carries the fields a reviewer needs rather than just the ids.
        expect(lines[1]).toContain('sync,paused,success,user,5,a@b.co,dev,connection:10,1.2.3.4,curl/8');
        expect(lines[2]).toContain('connection,deleted');
        expect(body).not.toContain('undefined');
    });

    it('honours the resource filter and the time window, and names the file after them', async () => {
        const { session, account } = await authAdmin();
        const inWindow = daysAgo(10);
        (await emitter.record(auditEvent(account.id, inWindow))).unwrap();
        (await emitter.record(auditEvent(account.id, daysAgo(2), { resource: 'sync', action: 'paused' }))).unwrap();

        const from = daysAgo(20);
        const to = daysAgo(5);
        const { res, body } = await exportCsv(session, { from, to, resources: 'connection' });

        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toBe(`attachment; filename="nango-audit-trail_${from.slice(0, 10)}_to_${to.slice(0, 10)}.csv"`);
        const lines = body.trim().split('\n');
        // The `sync` event is inside neither the window nor the resource filter, so only one row survives.
        expect(lines).toHaveLength(2);
        expect(lines[1]).toContain('connection,deleted');
        expect(body).not.toContain('sync,paused');
    });

    it('names a one-sided window for the side it has, so the file cannot read as a single day', async () => {
        const { session } = await authAdmin();
        const from = daysAgo(3);

        const { res } = await exportCsv(session, { from });

        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toBe(`attachment; filename="nango-audit-trail_since_${from.slice(0, 10)}.csv"`);
    });

    it('returns a header-only document when the account has nothing in the window', async () => {
        const { session } = await authAdmin();
        const { res, body } = await exportCsv(session, { from: '2020-01-01T00:00:00.000Z', to: '2020-01-02T00:00:00.000Z' });

        expect(res.status).toBe(200);
        expect(body.trim().split('\n')).toHaveLength(1);
    });
});
