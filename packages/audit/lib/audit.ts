import { Err, getLogger, isCloud } from '@nangohq/utils';

import { auditClickhouseClient } from './clickhouse.js';
import { ClickhouseAuditSink, DropSink } from './sink.js';

import type { AuditEvent } from './event.js';
import type { AuditSink } from './sink.js';
import type { Result } from '@nangohq/utils';

const logger = getLogger('audit');

// Placeholder until per-plan retention is wired (kept as a fixed tier for now to bound partitions).
const AUDIT_RETENTION_DAYS = 90;

export class Audit {
    constructor(private readonly sink: AuditSink) {}

    // Never throws — sink failures come back as `Err` for the caller to handle (log, metric, …).
    async record(event: AuditEvent): Promise<Result<void>> {
        try {
            return await this.sink.record(event);
        } catch (err) {
            return Err(err);
        }
    }
}

// Cloud writes directly to ClickHouse; other tiers (and a server without CH access) drop.
function getAuditSink(): AuditSink {
    if (!isCloud) {
        logger.info('Dropping audit events: not running on Nango Cloud');
        return new DropSink();
    }
    const client = auditClickhouseClient();
    if (!client) {
        logger.warning('Dropping audit events: running on Cloud but CLICKHOUSE_URL is not set');
        return new DropSink();
    }
    logger.info(`Writing audit events to ClickHouse (retention ${AUDIT_RETENTION_DAYS}d)`);
    return new ClickhouseAuditSink(client, AUDIT_RETENTION_DAYS);
}

export const audit = new Audit(getAuditSink());
