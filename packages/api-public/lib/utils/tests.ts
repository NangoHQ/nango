import Fastify from 'fastify';
import getPort from 'get-port';
import createClient from 'openapi-fetch';

import { multipleMigrations } from '@nangohq/database';
// import { migrate as migrateKeystore } from '@nangohq/keystore';
// import { migrateLogsMapping } from '@nangohq/logs';

import createApp from '../fastify.js';

import type { paths } from '../openapi.js';
import type { FastifyInstance } from 'fastify';

/**
 * Run the API in the test
 */
export async function runServer(): Promise<{ app: FastifyInstance; client: ReturnType<typeof createClient<paths>> }> {
    await multipleMigrations();
    // await migrateLogsMapping();
    // await migrateKeystore(db.knex);

    const app = Fastify();

    await createApp(app);

    await app.ready();

    const port = await getPort();
    app.listen({ host: '0.0.0.0', port }, (err) => {
        if (err) {
            app.log.error(err);
            process.exit(1);
        }
    });

    return { app, client: createClient<paths>({ baseUrl: `http://localhost:${port}` }) };
}

/*
 * Assert API response is an error
 */
export function isError<TType extends Record<string, any> | undefined>(
    json: TType extends { json: any } ? never : TType
): asserts json is Extract<TType extends { json: any } ? never : TType, { error: any }> {
    if (!json || !('error' in json)) {
        console.dir(json, { showHidden: true, depth: 100 });
        throw new Error('Response is not an error');
    }
}

/**
 * Assert API response is a success
 */
export function isSuccess<TType extends Record<string, any> | undefined>(
    json: TType extends { json: any } ? never : TType
): asserts json is Exclude<TType extends { json: any } ? never : TType, { error: any }> {
    if (json && 'error' in json) {
        console.dir(json, { showHidden: true, depth: 100 });
        throw new Error('Response is not a success');
    }
}
