import './tracer.js';
import * as cron from 'node-cron';

import { billing } from '@nangohq/billing';
import { DefaultTransport } from '@nangohq/pubsub';
import { Clickhouse, getUsageTracker, migrate as migrateUsage } from '@nangohq/usage';
import { initSentry, once, report } from '@nangohq/utils';

import { exportUsageCron } from './crons/usage.js';
import { envs } from './env.js';
import { TeamProcessor } from './processors/team.js';
import { UsageProcessor } from './processors/usage.js';
import { logger } from './utils.js';

try {
    process.on('unhandledRejection', (reason) => {
        logger.error('Received unhandledRejection...', reason);
        report(reason);
    });

    process.on('uncaughtException', (err) => {
        logger.error('Received uncaughtException...', err);
        report(err);
    });

    initSentry({ dsn: envs.SENTRY_DSN, applicationName: envs.NANGO_DB_APPLICATION_NAME, hash: envs.GIT_HASH });

    // PubSub
    const pubsubTransport = new DefaultTransport();
    const connect = await pubsubTransport.connect();
    if (connect.isErr()) {
        logger.error('Error connecting to ActiveMQ', connect.error);
        process.exit(1);
    }

    // Usage migrations
    const usageMigration = await migrateUsage();
    if (usageMigration.isErr()) {
        logger.error('Usage migration failed', usageMigration.error);
        process.exit(1);
    }

    // Usage
    const clickhouse = new Clickhouse();
    const usageTracker = await getUsageTracker(envs.NANGO_REDIS_URL);

    // Usage processor
    const usageProc = new UsageProcessor({ transport: pubsubTransport, usageTracker, clickhouse });
    usageProc.start();

    // Team processor
    const teamProc = new TeamProcessor({ transport: pubsubTransport });
    teamProc.start();

    // Crons
    exportUsageCron();

    // Graceful shutdown
    const close = once(async () => {
        const disconnect = await pubsubTransport.disconnect();
        if (disconnect.isErr()) {
            logger.error('Error disconnecting from ActiveMQ', disconnect.error);
        }
        const billingShutdown = await billing.shutdown();
        if (billingShutdown.isErr()) {
            logger.error('Error shutting down billing', billingShutdown.error);
        }
        const clickhouseShutdown = await clickhouse.shutdown();
        if (clickhouseShutdown.isErr()) {
            logger.error('Error shutting down Clickhouse ingestion', clickhouseShutdown.error);
        }
        cron.getTasks().forEach((task) => task.stop());
        process.exit();
    });

    process.on('SIGINT', () => {
        logger.info('Received SIGINT...');
        close();
    });

    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM...');
        close();
    });
} catch {
    process.exit(1);
}
