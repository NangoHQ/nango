import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';

const isEmbedded = !!process.env['NANGO_EMBEDDED_DB'] && process.env['NANGO_EMBEDDED_DB'] !== 'false';

let starting: Promise<void> | null = null;
let pgInstance: EmbeddedPostgres | null = null;
// true while ensureEmbeddedDb's own bootstrap client connects — bypasses the connect patch
let bootstrapping = false;

/**
 * Make every pg connection (knex pool or anything else in this process) wait for the
 * embedded postgres to be up, so queries racing the cold start don't get ECONNREFUSED.
 * pg is CommonJS, so require() it synchronously to patch the prototype.
 */
export function patchPgConnectForEmbedded(): void {
    if (!isEmbedded) return;
    const pg: any = createRequire(import.meta.url)('pg');
    const Client = pg.Client ?? pg.default?.Client;
    if (!Client || (Client.prototype.connect as any).__waitsForEmbedded) return;
    const origConnect = Client.prototype.connect;
    Client.prototype.connect = async function (...args: any[]) {
        if (!bootstrapping) {
            await ensureEmbeddedDb();
        }
        return origConnect.apply(this, args);
    };
    (Client.prototype.connect as any).__waitsForEmbedded = true;
}

async function isListening(port: number): Promise<boolean> {
    const net = await import('node:net');
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, 'localhost');
    });
}

/**
 * When NANGO_EMBEDDED_DB=true, start a bundled PostgreSQL instead of connecting to an external one.
 * No-op otherwise. Must be awaited before the first query.
 * With multiple services in separate processes, the first one to get here owns the server;
 * the others detect the port is taken and just connect to it.
 */
export function ensureEmbeddedDb(): Promise<void> {
    if (!isEmbedded) {
        return Promise.resolve();
    }
    if (!starting) {
        starting = (async () => {
            const port = +(process.env['NANGO_DB_PORT'] || 5433);
            const user = process.env['NANGO_DB_USER'] || 'nango';
            const password = process.env['NANGO_DB_PASSWORD'] || 'nango';
            const databaseDir = process.env['NANGO_EMBEDDED_DB_DIR'] || '.embedded-postgres';
            const dbName = process.env['NANGO_DB_NAME'] || 'nango';

            const alreadyRunning = await isListening(port);
            if (!alreadyRunning) {
                try {
                    const pg = new EmbeddedPostgres({ databaseDir, user, password, port, persistent: true });
                    if (!existsSync(join(databaseDir, 'PG_VERSION'))) {
                        await pg.initialise();
                    }
                    await pg.start();
                    pgInstance = pg; // we own it
                    // Kill the server if this process dies (destroy() must not stop it — other instances in this process still use it)
                    process.on('exit', () => {
                        (pg as any).process?.kill('SIGINT');
                    });
                } catch {
                    // Lost the race with another process starting its own server — wait for it to listen.
                    const deadline = Date.now() + 15000;
                    while (!(await isListening(port))) {
                        if (Date.now() > deadline) {
                            throw new Error('[embedded-postgres] failed to start and port is not listening');
                        }
                        await new Promise((r) => setTimeout(r, 250));
                    }
                }
            }

            try {
                const pgModule: any = await import('pg');
                const Client = (pgModule.Client ?? pgModule.default?.Client) as typeof import('pg').Client;
                bootstrapping = true;
                const base = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:${port}`;
                const maintenance = new Client({ connectionString: `${base}/postgres` });
                await maintenance.connect();
                try {
                    await maintenance.query(`CREATE DATABASE ${dbName}`);
                } catch {
                    // already exists
                }
                await maintenance.end();
                const client = new Client({ connectionString: `${base}/${dbName}` });
                await client.connect();
                await client.query(`CREATE SCHEMA IF NOT EXISTS ${process.env['NANGO_DB_SCHEMA'] || 'nango'}`);
                await client.end();
                bootstrapping = false;
            } catch (err) {
                bootstrapping = false;
                // Another process may be mid-startup; queries will retry through the pool.
                console.error('[embedded-postgres] setup warning:', err instanceof Error ? err.message : err);
                return;
            }
            console.log(`[embedded-postgres] running on localhost:${port}`);
        })();
    }
    return starting;
}

export async function stopEmbeddedDb(): Promise<void> {
    if (pgInstance) {
        await pgInstance.stop();
        pgInstance = null;
        starting = null;
    }
}
