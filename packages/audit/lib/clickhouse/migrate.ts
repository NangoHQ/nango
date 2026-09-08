import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate as migrateClickhouse } from '@nangohq/clickhouse-migrations';
import { getLogger } from '@nangohq/utils';

import { AUDIT_DATABASE, auditClickhouseClient } from './clickhouse.js';

import type { Result } from '@nangohq/utils';

const logger = getLogger('audit');

const migrationsDir = path.join(fileURLToPath(import.meta.url), '..', 'migrations');
const migrationsExt = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

export function migrate({ clickhouseUrl, database = AUDIT_DATABASE }: { clickhouseUrl: string | undefined; database?: string }): Promise<Result<void>> {
    return migrateClickhouse({
        // No database requested means the runner is about to CREATE DATABASE, so don't pick up the default.
        clickhouseClient: (opts) => (clickhouseUrl ? auditClickhouseClient(clickhouseUrl, { database: opts?.database ?? null }) : null),
        database,
        migrationsDir,
        migrationsExt,
        logger
    });
}
