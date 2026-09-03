import { auditClickhouseClient, AuditClient, ClickhouseAuditStore, NoopAuditStore, PostgresAuditStore, PubSubAuditWriter } from '@nangohq/audit';
import { pubsub } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';

import { auditDb, isSelfHostedAuditTrailEnabled } from './auditDb.js';
import { envs } from './env.js';

import type { AuditActor, AuditEvent, AuditReader, AuditTarget, AuditTargetType, AuditWriter } from '@nangohq/audit';
import type { InternalEndUser } from '@nangohq/types';

const logger = getLogger('audit');
const CHANGED_FIELDS_MAX = 30;
const CHANGED_FIELD_KEY_MAX = 64;

export const UNKNOWN_ACTOR: AuditActor = { type: 'unknown', id: 'unknown', display: 'unknown' };
export const PUBLIC_KEY_ACTOR: AuditActor = { type: 'public_key', id: 'unknown' };

// An end user is optional when a connect session carries tags, so the session can name nobody.
export function connectSessionActor(endUser?: InternalEndUser | null): AuditActor {
    return {
        type: 'connect_session',
        id: endUser?.endUserId ?? 'unknown',
        ...(endUser?.email ? { display: endUser.email } : {})
    };
}

export function toAuditId(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value.length > 0 ? value : undefined;
    }
    return typeof value === 'number' ? String(value) : undefined;
}

export function makeAuditTarget(type: AuditTargetType, value: unknown, display?: string): AuditTarget | undefined {
    const id = toAuditId(value);
    return id ? { type, id, ...(display ? { display } : {}) } : undefined;
}

// Names of the fields present in an input object — never their values, so secrets never leak.
export function changedFields(value: unknown): string[] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const keys = Object.keys(value)
        .filter((key) => key.length <= CHANGED_FIELD_KEY_MAX)
        .slice(0, CHANGED_FIELDS_MAX);
    return keys.length > 0 ? keys : undefined;
}

function buildClickhouseStore(url: string): ClickhouseAuditStore | null {
    try {
        return new ClickhouseAuditStore(auditClickhouseClient(url));
    } catch (err) {
        logger.error('Audit: failed to create the ClickHouse store', err);
        return null;
    }
}

export function selectAuditStores(): { writer: AuditWriter; reader: AuditReader; configured: boolean } {
    if (isSelfHostedAuditTrailEnabled(envs.NANGO_AUDIT_POSTGRES_DATABASE_URL)) {
        logger.info('Audit: reading and writing events in Postgres');
        const postgres = new PostgresAuditStore(auditDb(envs.NANGO_AUDIT_POSTGRES_DATABASE_URL));
        return { writer: postgres, reader: postgres, configured: true };
    }

    const clickhouse = envs.CLICKHOUSE_URL ? buildClickhouseStore(envs.CLICKHOUSE_URL) : null;

    if (clickhouse && envs.NANGO_AUDIT_TRANSPORT === 'pubsub') {
        logger.info('Audit: publishing events to pub/sub, reading from ClickHouse');
        return { writer: new PubSubAuditWriter(pubsub.publisher), reader: clickhouse, configured: true };
    }

    if (clickhouse) {
        logger.info('Audit: reading and writing events in ClickHouse');
        return { writer: clickhouse, reader: clickhouse, configured: true };
    }

    logger.warning('Audit: no backend configured, events are dropped');
    const noop = new NoopAuditStore();
    return { writer: noop, reader: noop, configured: false };
}

const stores = selectAuditStores();
export const audit = new AuditClient(stores.writer, stores.reader);

export const auditBackend = { configured: stores.configured };

export type AuditDropReason = 'write_failed' | 'build_failed';

export function auditEventDropped(resource: string, reason: AuditDropReason): void {
    metrics.increment(metrics.Types.AUDIT_EVENT_DROPPED, 1, { resource, reason });
}

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
    const result = await audit.record(event);
    if (result.isErr()) {
        logger.error(`failed to record audit event`, { resource: event.resource, action: event.action, err: result.error });
        auditEventDropped(event.resource, 'write_failed');
        return;
    }
    metrics.increment(metrics.Types.AUDIT_EVENT_RECORDED, 1, { resource: event.resource });
    if (event.actor.type === 'unknown') {
        metrics.increment(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, 1, { field: 'actor', resource: event.resource });
    }
}
