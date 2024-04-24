import { randomUUID } from 'crypto';
import type { StartedTestContainer } from 'testcontainers';
import { Wait, PostgreSqlContainer, GenericContainer } from 'testcontainers';

const containers: StartedTestContainer[] = [];

export async function setupElasticsearch() {
    console.log('Starting OpenSearch...');
    const openSearchPort = 9200;
    const os = await new GenericContainer('opensearchproject/opensearch:2.13.0')
        .withName(`os-test-${randomUUID()}`)
        .withEnvironment({
            'discovery.type': 'single-node',
            DISABLE_INSTALL_DEMO_CONFIG: 'true',
            DISABLE_SECURITY_PLUGIN: 'true',
            'http.port': `${openSearchPort}`
        })
        .withStartupTimeout(120_000)
        .withExposedPorts({
            container: openSearchPort,
            host: openSearchPort
        })
        .start();
    containers.push(os);

    const url = `http://${os.getHost()}:${os.getMappedPort(9200)}`;

    process.env['NANGO_LOGS_OS_URL'] = url;
    process.env['NANGO_LOGS_OS_USER'] = '';
    process.env['NANGO_LOGS_OS_PWD'] = '';
    console.log('ES running at', url);
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
    process.env['NANGO_DB_MIGRATION_FOLDER'] = './packages/shared/lib/db/migrations';
    process.env['TELEMETRY'] = 'false';
    process.env['RECORDS_DATABASE_URL'] = `postgres://${user}:${password}@localhost:${port}/${dbName}`;
}

export async function setup() {
    await Promise.all([setupPostgres(), setupElasticsearch()]);
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
