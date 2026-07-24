import { randomUUID } from 'crypto';

import { ElasticsearchContainer } from '@testcontainers/elasticsearch';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';

import type { StartedTestContainer } from 'testcontainers';

const containers: StartedTestContainer[] = [];

export async function setupElasticsearch() {
    console.log('Starting Elasticsearch...');
    const es = await new ElasticsearchContainer('elasticsearch:8.13.0')
        .withName(`es-test-${randomUUID()}`)
        .withEnvironment({
            'discovery.type': 'single-node',
            'xpack.security.enabled': 'false'
        })
        .withStartupTimeout(120_000)
        .withExposedPorts(9200)
        .start();
    containers.push(es);

    const url = `http://${es.getHost()}:${es.getMappedPort(9200)}`;

    process.env['NANGO_LOGS_ES_URL'] = url;
    process.env['NANGO_LOGS_ES_USER'] = '';
    process.env['NANGO_LOGS_ES_PWD'] = '';
    process.env['NANGO_LOGS_ENABLED'] = 'true';
    console.log('ES running at', url);
}

export async function setupOpenSearch() {
    console.log('Starting OpenSearch...');
    const os = await new GenericContainer('opensearchproject/opensearch:2.13.0')
        .withName(`os-test-${randomUUID()}`)
        .withEnvironment({
            'discovery.type': 'single-node',
            DISABLE_SECURITY_PLUGIN: 'true',
            OPENSEARCH_JAVA_OPTS: '-Xms512m -Xmx512m'
        })
        .withStartupTimeout(120_000)
        .withExposedPorts(9200)
        .withWaitStrategy(Wait.forHttp('/_cluster/health', 9200))
        .start();
    containers.push(os);

    const url = `http://${os.getHost()}:${os.getMappedPort(9200)}`;

    process.env['NANGO_LOGS_ES_URL'] = url;
    process.env['NANGO_LOGS_ES_USER'] = '';
    process.env['NANGO_LOGS_ES_PWD'] = '';
    process.env['NANGO_LOGS_ENABLED'] = 'true';
    process.env['NANGO_LOGS_PROVIDER'] = 'opensearch';
    console.log('OpenSearch running at', url);
}

async function setupLogsStorage() {
    if (process.env['NANGO_LOGS_PROVIDER'] === 'opensearch') {
        await setupOpenSearch();
    } else {
        await setupElasticsearch();
    }
}

async function setupPostgres() {
    const dbName = 'postgres';
    const user = 'postgres';
    const password = 'nango_test';
    const container = new PostgreSqlContainer('postgres:15.5-alpine');
    const pg = await container
        .withDatabase(dbName)
        .withUsername(user)
        .withPassword(password)
        .withExposedPorts(5432)
        .withName(`pg-test-${randomUUID()}`)
        .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
        .start();

    containers.push(pg);
    const port = pg.getMappedPort(5432);

    process.env['NANGO_DB_PASSWORD'] = password;
    process.env['NANGO_DB_HOST'] = 'localhost';
    process.env['NANGO_DB_USER'] = user;
    process.env['NANGO_DB_PORT'] = port.toString();
    process.env['NANGO_DB_NAME'] = dbName;
    process.env['RECORDS_DATABASE_URL'] = `postgres://${user}:${password}@localhost:${port}/${dbName}`;
}

export async function setupActiveMQ() {
    console.log('Starting ActiveMQ...');
    const amq = await new GenericContainer('apache/activemq-classic:5.18.3').withExposedPorts(61614).withName(`activemq-test-${randomUUID()}`).start();
    containers.push(amq);

    const url = `ws://${amq.getHost()}:${amq.getMappedPort(61614)}`;

    process.env['NANGO_ACTIVEMQ_URL'] = url;
    process.env['NANGO_ACTIVEMQ_USER'] = 'admin';
    process.env['NANGO_ACTIVEMQ_PASSWORD'] = 'admin';
    console.log('ActiveMQ running at', url);
}

export async function setupRedis() {
    console.log('Starting Redis...');
    const redis = await new GenericContainer('redis:8.0.4-alpine').withExposedPorts(6379).withName(`redis-test-${randomUUID()}`).start();
    containers.push(redis);

    const url = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;

    process.env['NANGO_REDIS_URL'] = url;
    console.log('Redis running at', url);
}

export async function setupClickhouse() {
    console.log('Starting Clickhouse...');
    const clickhouse = await new GenericContainer('clickhouse/clickhouse-server:26.2')
        .withExposedPorts(8123)
        .withName(`clickhouse-test-${randomUUID()}`)
        .withEnvironment({ CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1', ALLOW_EMPTY_PASSWORD: 'yes' })
        .withWaitStrategy(Wait.forHttp('/ping', 8123))
        .start();
    containers.push(clickhouse);

    const url = `http://${clickhouse.getHost()}:${clickhouse.getMappedPort(8123)}`;
    process.env['CLICKHOUSE_URL'] = url;
    console.log('Clickhouse running at', url);
}

// Every runServer()-based integration test (and a few others) calls these same migration
// functions in its own beforeAll. With fileParallelism, many files' beforeAll hooks fire
// concurrently and race for knex's migration lock on the same shared schema — whichever loses
// throws `MigrationLocked: Migration table is already locked`. Running them once here, before any
// test file starts, means every file's own call sees zero pending migrations and never reaches
// the lock-acquiring code path.
//
// Each step is independent and best-effort: if one fails (e.g. to import), the others still run,
// and any file's own migration call remains the real safety net, just as it was before
// fileParallelism.
async function runMigrationOnce(name: string, run: () => Promise<void>) {
    try {
        await run();
    } catch (err) {
        console.error(`Pre-migration "${name}" in globalSetup failed, falling back to per-file migration calls`, err);
    }
}

async function runMigrationsOnce() {
    const { multipleMigrations, default: db } = await import('@nangohq/database');
    await runMigrationOnce('database', () => multipleMigrations());
    await runMigrationOnce('keystore', async () => {
        const { migrate: migrateKeystore } = await import('@nangohq/keystore');
        await migrateKeystore(db.knex);
    });
    await runMigrationOnce('logs', async () => {
        const { migrateLogsMapping } = await import('@nangohq/logs');
        await migrateLogsMapping();
    });
    await runMigrationOnce('records', async () => {
        const { records } = await import('@nangohq/records');
        await records.migrate();
    });
    await runMigrationOnce('tasks', async () => {
        // packages/server/lib/tasks/index.ts constructs a full Tasks (Scheduler + TaskProcessor)
        // just to get this schema migrated, which has side effects we don't want in globalSetup.
        // DatabaseClient is the same underlying migration runner without any of that.
        const [{ DatabaseClient, defaultDatabaseClientOptions }, { ENVS, parseEnvs }] = await Promise.all([
            import('@nangohq/scheduler'),
            import('@nangohq/utils')
        ]);
        const envs = parseEnvs(ENVS);
        const databaseUrl =
            envs.NANGO_DATABASE_URL ||
            `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}`;
        const client = new DatabaseClient({ ...defaultDatabaseClientOptions, url: databaseUrl, schema: envs.TASKS_DATABASE_SCHEMA });
        try {
            await client.migrate();
        } finally {
            await client.destroy();
        }
    });
    await runMigrationOnce('sessions', async () => {
        // packages/server/lib/clients/auth.client.ts constructs a module-level KnexSessionStore,
        // which does its own check-then-create of this table (not a tracked knex migration) the
        // first time any file imports it. Doing that once here, ahead of any test file, avoids
        // every fork racing to CREATE TABLE the same table concurrently.
        const [{ default: connectSessionKnex }, { default: session }, { default: db }] = await Promise.all([
            import('connect-session-knex'),
            import('express-session'),
            import('@nangohq/database')
        ]);
        const KnexSessionStore = connectSessionKnex(session);
        const store = new KnexSessionStore({ knex: db.knex, tablename: '_nango_sessions', sidfieldname: 'sid' });
        await store.ready;
    });
}

export async function setup() {
    await Promise.all([setupPostgres(), setupLogsStorage(), setupActiveMQ(), setupRedis(), setupClickhouse()]);
    await runMigrationsOnce();
}

export const teardown = async () => {
    await Promise.all(
        containers.map(async (container) => {
            try {
                await container.stop();
            } catch (err) {
                console.error(err);
            }
        })
    );
};
