import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditClickhouseClient, ClickhouseAuditStore } from '@nangohq/audit';
import { seeders } from '@nangohq/shared';
import { migrate } from '@nangohq/usage';

import { authenticateUser, isSuccess, runServer } from '../../../utils/tests.js';

import type { AuditEvent } from '@nangohq/audit';

let api: Awaited<ReturnType<typeof runServer>>;
let auditClient: ReturnType<typeof auditClickhouseClient>;
let store: ClickhouseAuditStore;

async function authAdmin() {
    const { account, env, user } = await seeders.seedAccountEnvAndUser();
    const session = await authenticateUser(api, user);
    return { session, account, env };
}

function auditEvent(accountId: number, occurredAt: string): AuditEvent {
    return {
        occurredAt,
        accountId,
        environment: null,
        actor: { type: 'user', id: '5', display: 'a@b.co' },
        resource: 'connection',
        action: 'deleted',
        targets: [{ type: 'connection', id: '10' }],
        context: {},
        outcome: 'success'
    };
}

describe('GET /api/v1/audit-trail', () => {
    beforeAll(async () => {
        api = await runServer();
        // The endpoint reads from usage.audit_trail_events; create it in the shared ClickHouse container.
        (await migrate({ database: 'usage' })).unwrap();
        auditClient = auditClickhouseClient(process.env['CLICKHOUSE_URL']!);
        store = new ClickhouseAuditStore(auditClient);
    });

    afterAll(async () => {
        api.server.close();
        await auditClient.close();
    });

    // RBAC (403 for development_full_access, allowed for administrator + production_support) is covered
    // centrally in packages/server/lib/authz/authz.integration.test.ts alongside every other endpoint.

    it('rejects a non-decodable cursor with 400', async () => {
        const { session, env } = await authAdmin();
        const res = await api.fetch('/api/v1/audit-trail', { method: 'GET', session, query: { env: env.name, cursor: 'not-a-valid-cursor' } });
        expect(res.res.status).toBe(400);
    });

    it('rejects a JSON-shaped cursor with invalid values with 400, not 500', async () => {
        const { session, env } = await authAdmin();
        const cursor = Buffer.from(JSON.stringify({ occurredAt: 'garbage', id: 'not-a-uuid' })).toString('base64');
        const res = await api.fetch('/api/v1/audit-trail', { method: 'GET', session, query: { env: env.name, cursor } });
        expect(res.res.status).toBe(400);
    });

    it('rejects an invalid date with 400', async () => {
        const { session, env } = await authAdmin();
        const res = await api.fetch('/api/v1/audit-trail', { method: 'GET', session, query: { env: env.name, from: 'not-a-date' } });
        expect(res.res.status).toBe(400);
    });

    it('rejects an inverted from/to range with 400', async () => {
        const { session, env } = await authAdmin();
        const res = await api.fetch('/api/v1/audit-trail', {
            method: 'GET',
            session,
            query: { env: env.name, from: '2026-07-16T10:00:00.000Z', to: '2026-07-16T09:00:00.000Z' }
        });
        expect(res.res.status).toBe(400);
    });

    it('ignores unknown query params (the dashboard appends extras) instead of 400', async () => {
        const { session, env } = await authAdmin();
        const res = await api.fetch('/api/v1/audit-trail', {
            method: 'GET',
            session,
            // @ts-expect-error the endpoint type doesn't declare this param; it must be stripped, not rejected, at runtime.
            query: { env: env.name, unexpected: '1' }
        });
        expect(res.res.status).toBe(200);
    });

    it("returns the account's events in the response envelope, most-recent first", async () => {
        const { session, account, env } = await authAdmin();
        (await store.record(auditEvent(account.id, '2026-07-16T10:00:00.000Z'))).unwrap();
        (await store.record(auditEvent(account.id, '2026-07-16T10:00:01.000Z'))).unwrap();

        const res = await api.fetch('/api/v1/audit-trail', { method: 'GET', session, query: { env: env.name } });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data).toHaveLength(2);
        expect(res.json.pagination.nextCursor).toBeNull();
        // Most-recent first: the 10:00:01 event precedes the 10:00:00 one.
        expect(res.json.data.map((e) => e.occurredAt)).toEqual(['2026-07-16T10:00:01.000Z', '2026-07-16T10:00:00.000Z']);
        const event = res.json.data[0]!;
        expect(event.accountId).toBe(account.id);
        expect(event.version).toBe('2026-07-16');
        expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(event.resource).toBe('connection');
        expect(event.action).toBe('deleted');
    });

    it('paginates via the opaque cursor', async () => {
        const { session, account, env } = await authAdmin();
        // 26 events one second apart (oldest → newest) — one more than the fixed page size of 25.
        const base = Date.parse('2026-07-16T10:00:00.000Z');
        for (let i = 0; i < 26; i++) {
            (await store.record(auditEvent(account.id, new Date(base + i * 1000).toISOString()))).unwrap();
        }

        const page1 = await api.fetch('/api/v1/audit-trail', { method: 'GET', session, query: { env: env.name } });
        expect(page1.res.status).toBe(200);
        isSuccess(page1.json);
        expect(page1.json.data).toHaveLength(25);
        expect(page1.json.pagination.nextCursor).not.toBeNull();
        expect(page1.json.data[0]!.occurredAt).toBe(new Date(base + 25 * 1000).toISOString()); // newest first

        const page2 = await api.fetch('/api/v1/audit-trail', {
            method: 'GET',
            session,
            query: { env: env.name, cursor: page1.json.pagination.nextCursor! }
        });
        expect(page2.res.status).toBe(200);
        isSuccess(page2.json);
        expect(page2.json.data).toHaveLength(1);
        expect(page2.json.pagination.nextCursor).toBeNull();
        expect(page2.json.data[0]!.occurredAt).toBe(new Date(base).toISOString()); // the oldest event

        // pages don't overlap
        const page1Ids = new Set(page1.json.data.map((e) => e.id));
        expect(page1Ids.has(page2.json.data[0]!.id)).toBe(false);
    });
});
