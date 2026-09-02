import { auditClickhouseClient, AuditClient, ClickhouseAuditStore, NoopAuditStore, PubSubAuditWriter } from '@nangohq/audit';
import { pubsub } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';

import { envs } from './env.js';

import type { AuditActor, AuditEvent, AuditTarget, AuditTargetType, AuditWriter } from '@nangohq/audit';
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

function buildClickhouseStore(): ClickhouseAuditStore | null {
    if (!envs.CLICKHOUSE_URL) {
        return null;
    }
    try {
        return new ClickhouseAuditStore(auditClickhouseClient(envs.CLICKHOUSE_URL));
    } catch (err) {
        logger.error('Audit: failed to create the ClickHouse store', err);
        return null;
    }
}

function buildWriter(clickhouse: ClickhouseAuditStore | null): AuditWriter {
    if (envs.NANGO_AUDIT_TRANSPORT === 'pubsub') {
        logger.info('Audit: publishing events to pub/sub');
        return new PubSubAuditWriter(pubsub.publisher);
    }
    if (clickhouse) {
        logger.info('Audit: writing events to ClickHouse');
        return clickhouse;
    }
    logger.warning('Audit: no backend configured, events are dropped');
    return new NoopAuditStore();
}

const clickhouseStore = buildClickhouseStore();
export const audit = new AuditClient(buildWriter(clickhouseStore), clickhouseStore ?? new NoopAuditStore());

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
