import { auditClickhouseClient, AuditClient, ClickhouseAuditStore, DropAuditStore, PubSubAuditWriter } from '@nangohq/audit';
import { pubsub } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import { envs } from './env.js';

import type { AuditWriter } from '@nangohq/audit';

const logger = getLogger('audit');

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
    return new DropAuditStore();
}

const clickhouseStore = buildClickhouseStore();
export const audit = new AuditClient(buildWriter(clickhouseStore), clickhouseStore ?? new DropAuditStore());
