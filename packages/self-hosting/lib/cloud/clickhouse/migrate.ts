import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate as migrateClickhouse } from '@nangohq/clickhouse-migrations';
import { getLogger } from '@nangohq/utils';

import { INSTALLATIONS_DATABASE, installationsClickhouseClient } from './clickhouse.js';

import type { Result } from '@nangohq/utils';

const logger = getLogger('self-hosting');

const migrationsDir = path.join(fileURLToPath(import.meta.url), '..', 'migrations');
const migrationsExt = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

export function migrate({ clickhouseUrl, database = INSTALLATIONS_DATABASE }: { clickhouseUrl: string | undefined; database?: string }): Promise<Result<void>> {
    return migrateClickhouse({
        clickhouseClient: (opts) => (clickhouseUrl ? installationsClickhouseClient(clickhouseUrl, { database: opts?.database ?? null }) : null),
        database,
        migrationsDir,
        migrationsExt,
        logger
    });
}
