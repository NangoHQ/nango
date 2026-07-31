import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate as migrateClickhouse } from '@nangohq/clickhouse-migrations';

import { logger } from '../logger.js';
import { clickhouseClient, database as usageDatabase } from './config.js';

import type { Result } from '@nangohq/utils';

const migrationsDir = path.join(fileURLToPath(import.meta.url), '..', 'migrations');
const migrationsExt = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

export function migrate({ database }: { database: string } = { database: usageDatabase }): Promise<Result<void>> {
    return migrateClickhouse({ clickhouseClient, database, migrationsDir, migrationsExt, logger });
}
