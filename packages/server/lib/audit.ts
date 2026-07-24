import { Audit, auditClickhouseClient, ClickhouseAuditStore, DropAuditStore } from '@nangohq/audit';
import { getLogger } from '@nangohq/utils';

import { envs } from './env.js';

import type { AuditStore } from '@nangohq/audit';

const logger = getLogger('audit');

// Reads from and writes to ClickHouse when CLICKHOUSE_URL is configured (Cloud); otherwise drops
// writes and returns empty reads. Built once and shared across the server.
function buildStore(): AuditStore {
    if (!envs.CLICKHOUSE_URL) {
        return new DropAuditStore();
    }
    try {
        const store = new ClickhouseAuditStore(auditClickhouseClient(envs.CLICKHOUSE_URL));
        logger.info('Audit: reading and writing events to ClickHouse');
        return store;
    } catch (err) {
        logger.error('Audit: failed to create the ClickHouse store, events are dropped', err);
        return new DropAuditStore();
    }
}

export const audit = new Audit(buildStore());
