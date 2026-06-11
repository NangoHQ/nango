import type { Knex } from 'knex';

export function makePostgresConfig(opts: {
    databaseUrl: string;
    schema: string;
    statementTimeout: number;
    ssl: boolean;
    applicationName?: string | undefined;
    pool: {
        min: number;
        max: number;
    };
}): Knex.Config & { migrations: Knex.MigratorConfig } {
    const runningMigrationOnly = process.argv.some((v) => v === 'migrate:latest');
    const isJS = !runningMigrationOnly;
    return {
        client: 'postgres',
        connection: {
            connectionString: opts.databaseUrl,
            statement_timeout: opts.statementTimeout,
            ssl: opts.ssl ? { rejectUnauthorized: false } : false,
            application_name: opts.applicationName || 'unknown'
        },
        searchPath: opts.schema,
        pool: { min: opts.pool.min, max: opts.pool.max },
        migrations: {
            extension: isJS ? 'js' : 'ts',
            directory: 'migrations',
            tableName: 'migrations',
            loadExtensions: [isJS ? '.js' : '.ts'],
            schemaName: opts.schema
        }
    };
}
