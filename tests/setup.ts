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
    const amq = await new GenericContainer('apache/activemq-classic:5.18.3').withExposedPorts(61614).start();
    containers.push(amq);

    const url = `ws://${amq.getHost()}:${amq.getMappedPort(61614)}`;

    process.env['NANGO_ACTIVEMQ_URL'] = url;
    process.env['NANGO_ACTIVEMQ_USER'] = 'admin';
    process.env['NANGO_ACTIVEMQ_PASSWORD'] = 'admin';
    console.log('ActiveMQ running at', url);
}

export async function setup() {
    await Promise.all([setupPostgres(), setupElasticsearch(), setupActiveMQ()]);
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
