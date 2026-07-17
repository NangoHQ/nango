import { Audit, auditClickhouseClient, ClickhouseAuditSink, DropSink } from '@nangohq/audit';
import { getLogger } from '@nangohq/utils';

import { envs } from './env.js';

import type { AuditSink } from '@nangohq/audit';

const logger = getLogger('audit');

// Writes to ClickHouse when CLICKHOUSE_URL is configured (Cloud); otherwise drops. Built once and
// shared across the server — the sink is fixed at construction, never swapped at runtime.
function buildSink(): AuditSink {
    if (!envs.CLICKHOUSE_URL) {
        return new DropSink();
    }
    try {
        const sink = new ClickhouseAuditSink(auditClickhouseClient(envs.CLICKHOUSE_URL));
        logger.info('Audit: writing events to ClickHouse');
        return sink;
    } catch (err) {
        logger.error('Audit: failed to configure the ClickHouse sink, dropping events', err);
        return new DropSink();
    }
}

export const audit = new Audit(buildSink());
