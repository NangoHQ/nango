import { GenericContainer, StartedTestContainer, TestContainer, Wait } from 'testcontainers';

let startedContainer: StartedTestContainer;

export const setup = async () => {
    const container: TestContainer = await new GenericContainer('postgres');
    startedContainer = await container
        .withEnvironment({ POSTGRES_USER: 'postgres' })
        .withEnvironment({ POSTGRES_PASSWORD: 'nango_test' })
        .withEnvironment({ POSTGRES_DB: 'postgres' })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
        .start();

    const port = startedContainer.getMappedPort(5432);

    const testCred = 'nango_test';

    process.env['NANGO_DB_PASSWORD'] = testCred;
    process.env['NANGO_DB_HOST'] = 'localhost';
    process.env['NANGO_DB_USER'] = 'postgres';
    process.env['NANGO_DB_PORT'] = port.toString();
    process.env['NANGO_DB_NAME'] = 'postgres';
    process.env['NANGO_DB_MIGRATION_FOLDER'] = './packages/shared/lib/db/migrations';
    process.env['TELEMETRY'] = 'false';
};

export const teardown = async () => {
    if (startedContainer) {
        startedContainer.stop();
    }
};
