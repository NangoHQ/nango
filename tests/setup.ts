import type { StartedTestContainer } from 'testcontainers';
import { Wait, PostgreSqlContainer, ElasticsearchContainer } from 'testcontainers';

const containers: StartedTestContainer[] = [];

export async function setupElasticsearch() {
    console.log('Starting ES...');
    const es = await new ElasticsearchContainer('elasticsearch:8.12.2').withEnvironment({ 'xpack.security.enabled': 'false' }).start();
    containers.push(es);

    process.env['NANGO_LOGS_ES_URL'] = es.getHttpUrl();
    process.env['NANGO_LOGS_ES_USER'] = '';
    process.env['NANGO_LOGS_ES_PWD'] = '';
}

async function setupPostgres() {
    const container = new PostgreSqlContainer();
    const pg = await container
        .withDatabase('postgres')
        .withUsername('postgres')
        .withPassword('nango_test')
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
        .start();

    containers.push(pg);
    const port = pg.getMappedPort(5432);

    const testCred = 'nango_test';

    process.env['NANGO_DB_PASSWORD'] = testCred;
    process.env['NANGO_DB_HOST'] = 'localhost';
    process.env['NANGO_DB_USER'] = 'postgres';
    process.env['NANGO_DB_PORT'] = port.toString();
    process.env['NANGO_DB_NAME'] = 'postgres';
    process.env['NANGO_DB_MIGRATION_FOLDER'] = './packages/shared/lib/db/migrations';
    process.env['TELEMETRY'] = 'false';
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
