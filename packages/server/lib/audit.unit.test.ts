import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClickhouseAuditStore, NoopAuditStore, PostgresAuditStore, PubSubAuditWriter } from '@nangohq/audit';
import { metrics } from '@nangohq/utils';

import { audit, auditEventDropped, recordAuditEvent, selectAuditStores } from './audit.js';
import { destroyAuditDb } from './auditDb.js';
import { envs } from './env.js';

import type { AuditEvent } from '@nangohq/audit';

const event = { resource: 'integration', action: 'deleted' } as unknown as AuditEvent;

describe('recordAuditEvent', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('counts a written event under its resource', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        vi.spyOn(audit, 'record').mockResolvedValue({ isErr: () => false } as never);

        await recordAuditEvent(event);

        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_RECORDED, 1, { resource: 'integration' });
        expect(increment).not.toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_DROPPED, 1, expect.anything());
    });

    it('counts a write failure as a drop, since nothing retries it', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        vi.spyOn(audit, 'record').mockResolvedValue({ isErr: () => true, error: new Error('pubsub down') } as never);

        await recordAuditEvent(event);

        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_DROPPED, 1, { resource: 'integration', reason: 'write_failed' });
        expect(increment).not.toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_RECORDED, 1, expect.anything());
    });

    it('tags a drop that happened before the event was built', () => {
        const increment = vi.spyOn(metrics, 'increment');

        auditEventDropped('sync', 'build_failed');

        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_DROPPED, 1, { resource: 'sync', reason: 'build_failed' });
    });
});

describe('selectAuditStores', () => {
    const original = {
        transport: envs.NANGO_AUDIT_TRANSPORT,
        clickhouse: envs.CLICKHOUSE_URL,
        auditDb: envs.AUDIT_DATABASE_URL,
        flag: envs.FLAG_AUDIT_TRAIL_ENABLED
    };

    afterEach(async () => {
        (envs as any).NANGO_AUDIT_TRANSPORT = original.transport;
        (envs as any).CLICKHOUSE_URL = original.clickhouse;
        (envs as any).AUDIT_DATABASE_URL = original.auditDb;
        (envs as any).FLAG_AUDIT_TRAIL_ENABLED = original.flag;
        await destroyAuditDb();
    });

    it('picks Postgres over ClickHouse when the trail is enabled with a database', () => {
        (envs as any).FLAG_AUDIT_TRAIL_ENABLED = true;
        (envs as any).AUDIT_DATABASE_URL = 'postgres://localhost:5432/nango';
        (envs as any).CLICKHOUSE_URL = 'http://localhost:8123';

        const { writer, reader } = selectAuditStores();
        expect(writer).toBeInstanceOf(PostgresAuditStore);
        expect(reader).toBe(writer);
    });

    it('ignores the audit database while the trail is disabled', () => {
        (envs as any).FLAG_AUDIT_TRAIL_ENABLED = false;
        (envs as any).AUDIT_DATABASE_URL = 'postgres://localhost:5432/nango';
        (envs as any).NANGO_AUDIT_TRANSPORT = 'direct';
        (envs as any).CLICKHOUSE_URL = 'http://localhost:8123';

        const { writer } = selectAuditStores();
        expect(writer).toBeInstanceOf(ClickhouseAuditStore);
    });

    it('publishes to pub/sub and reads from ClickHouse', () => {
        (envs as any).AUDIT_DATABASE_URL = undefined;
        (envs as any).NANGO_AUDIT_TRANSPORT = 'pubsub';
        (envs as any).CLICKHOUSE_URL = 'http://localhost:8123';

        const { writer, reader } = selectAuditStores();
        expect(writer).toBeInstanceOf(PubSubAuditWriter);
        expect(reader).toBeInstanceOf(ClickhouseAuditStore);
    });

    it('does not publish to pub/sub with no ClickHouse to read from', () => {
        (envs as any).AUDIT_DATABASE_URL = undefined;
        (envs as any).NANGO_AUDIT_TRANSPORT = 'pubsub';
        (envs as any).CLICKHOUSE_URL = undefined;

        const { writer, reader } = selectAuditStores();
        expect(writer).toBeInstanceOf(NoopAuditStore);
        expect(reader).toBe(writer);
    });

    it('reads and writes ClickHouse when it is the only backend', () => {
        (envs as any).AUDIT_DATABASE_URL = undefined;
        (envs as any).NANGO_AUDIT_TRANSPORT = 'direct';
        (envs as any).CLICKHOUSE_URL = 'http://localhost:8123';

        const { writer, reader } = selectAuditStores();
        expect(writer).toBeInstanceOf(ClickhouseAuditStore);
        expect(reader).toBe(writer);
    });

    it('drops events when no backend is configured', () => {
        (envs as any).AUDIT_DATABASE_URL = undefined;
        (envs as any).NANGO_AUDIT_TRANSPORT = 'direct';
        (envs as any).CLICKHOUSE_URL = undefined;

        const { writer, reader } = selectAuditStores();
        expect(writer).toBeInstanceOf(NoopAuditStore);
        expect(reader).toBe(writer);
    });
});
