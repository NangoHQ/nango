import './tracer.js';

import { setTimeout } from 'node:timers/promises';

import { destroyHostedTelemetryDb } from '@nangohq/hosted-telemetry';
import { metrics, once, report } from '@nangohq/utils';

import { boot as bootCloud } from './cloud/boot.js';
import { destroyCloudDb } from './cloud/db/client.js';
import { createCloudServer } from './cloud/server.js';
import { envs } from './env.js';
import { boot as bootInstallation } from './installation/boot.js';
import { createInstallationServer } from './installation/server.js';
import { mode } from './mode.js';
import { logger } from './utils.js';

import type { ClickHouseClient } from '@clickhouse/client';
import type { Express } from 'express';
import type { Server } from 'node:http';

process.on('unhandledRejection', (reason) => {
    logger.error('Received unhandledRejection...', reason);
    report(reason);
});

process.on('uncaughtException', (err) => {
    logger.error('Received uncaughtException...', err);
    report(err);
});

let api: Server;
let clickhouse: ClickHouseClient | undefined;
let uploadTelemetry: { abort: () => Promise<void> } | undefined;
const UPLOAD_TELEMETRY_STOP_TIMEOUT_MS = 5_000;

try {
    let server: Express;
    if (mode === 'cloud') {
        const cloud = await bootCloud();
        clickhouse = cloud.clickhouse;
        server = createCloudServer(cloud);
    } else {
        ({ uploadTelemetry } = await bootInstallation());
        server = createInstallationServer();
    }

    const port = envs.NANGO_SELF_HOSTING_PORT;
    api = server.listen(port, () => {
        logger.info(`🚀 self-hosting (${mode}) ready at http://localhost:${port}`);
    });
    // Longer than the load balancer's idle timeout, so it never reuses a connection we already closed.
    api.keepAliveTimeout = envs.NANGO_SELF_HOSTING_KEEP_ALIVE_TIMEOUT_MS;
    api.headersTimeout = envs.NANGO_SELF_HOSTING_KEEP_ALIVE_TIMEOUT_MS + 1000;
    api.once('error', (err) => {
        logger.error('Failed to listen', err);
        process.exit(1);
    });
} catch (err) {
    logger.error('Failed to start', err);
    process.exit(1);
}

const close = once(() => {
    logger.info('Closing...');
    const uploadTelemetryStopped = uploadTelemetry?.abort();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    api.close(async () => {
        // A page being sent can take minutes when Nango is slow. It is sent again later, so we do not wait for it.
        await Promise.race([uploadTelemetryStopped, setTimeout(UPLOAD_TELEMETRY_STOP_TIMEOUT_MS, undefined, { ref: false })]);
        await destroyCloudDb();
        await clickhouse?.close();
        await destroyHostedTelemetryDb();

        logger.close();

        console.info('Closed');

        await metrics.flush();
        process.exit();
    });
});

process.on('SIGINT', () => {
    logger.info('Received SIGINT...');
    close();
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM...');
    close();
});
