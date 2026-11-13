import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate as migrateClickhouse } from '@nangohq/clickhouse-migrations';

import { logger } from '../../utils.js';
import { INSTALLATIONS_DATABASE, installationsClickhouseClient } from './clickhouse.js';

import type { Result } from '@nangohq/utils';

const migrationsDir = path.join(fileURLToPath(import.meta.url), '..', 'migrations');
const migrationsExt = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

export function migrate({ clickhouseUrl, database = INSTALLATIONS_DATABASE }: { clickhouseUrl: string; database?: string }): Promise<Result<void>> {
    return migrateClickhouse({
        clickhouseClient: (opts) => installationsClickhouseClient(clickhouseUrl, { database: opts?.database ?? null }),
        database,
        migrationsDir,
        migrationsExt,
        logger
    });
}
