import type { StartedTestContainer } from 'testcontainers';
import { Wait, PostgreSqlContainer } from 'testcontainers';

const containers: StartedTestContainer[] = [];

async function setupPostgres() {
    const container = new PostgreSqlContainer('postgres:15.5-alpine');
    const pg = await container
        .withDatabase('postgres')
        .withUsername('postgres')
        .withPassword('nango_test')
        .withExposedPorts(5432)
        .withName('pg-test')
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
    await Promise.all([setupPostgres()]);
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
