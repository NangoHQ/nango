import './tracer.js';

import * as cron from 'node-cron';

import { auditClickhouseClient, ClickhouseAuditStore, migrate as migrateAudit } from '@nangohq/audit';
import { billing } from '@nangohq/billing';
import { destroy as destroyFeatureFlags, initialize as initializeFeatureFlags } from '@nangohq/feature-flags';
import { DefaultTransport } from '@nangohq/pubsub';
import { Clickhouse, getUsageTracker, migrate as migrateUsage } from '@nangohq/usage';
import { once, report } from '@nangohq/utils';

import { billingEventsS3DLQMonitorCron } from './crons/billingEventsS3DLQMonitor.js';
import { billingEventsS3ExportCron } from './crons/billingEventsS3Export.js';
import { exportUsageCron } from './crons/usage.js';
import { e2bSandboxesDaemon } from './daemons/e2b-sandboxes.daemon.js';
import { envs } from './env.js';
import { AuditProcessor } from './processors/audit.js';
import { TeamProcessor } from './processors/team.js';
import { UsageProcessor } from './processors/usage.js';
import { logger } from './utils.js';

const WRITE_TIMEOUT_FRACTION_OF_VISIBILITY = 2 / 3;

try {
    process.on('unhandledRejection', (reason) => {
        logger.error('Received unhandledRejection...', reason);
        report(reason);
    });

    process.on('uncaughtException', (err) => {
        logger.error('Received uncaughtException...', err);
        report(err);
    });

    await initializeFeatureFlags();

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

    // Audit migrations
    const auditMigration = await migrateAudit({ clickhouseUrl: envs.CLICKHOUSE_URL });
    if (auditMigration.isErr()) {
        logger.error('Audit migration failed', auditMigration.error);
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

    // Audit processor. The queue URL comes from the pub/sub config so it stays the single source of truth
    // even though this consumer polls SQS itself. The write timeout is derived from the visibility timeout
    // rather than configured: an insert outliving a message's invisibility would be redelivered while the
    // first attempt is still running, and both would write the row.
    const auditQueueUrl = envs.NANGO_PUBSUB_SNS_SQS_CONFIG.queueUrls?.['audit:audit'];
    // Audit events only reach SQS when the publisher targets SNS, which is the `sns-sqs` transport alone —
    // under `activemq` or `migration` the producer publishes to ActiveMQ, so there would be nothing to poll.
    const auditProc =
        envs.NANGO_PUBSUB_TRANSPORT === 'sns-sqs' && envs.CLICKHOUSE_URL && auditQueueUrl
            ? new AuditProcessor({
                  queueUrl: auditQueueUrl,
                  store: new ClickhouseAuditStore(
                      auditClickhouseClient(envs.CLICKHOUSE_URL, {
                          requestTimeoutMs: Math.floor(envs.NANGO_AUDIT_CONSUMER_VISIBILITY_TIMEOUT_SECONDS * 1000 * WRITE_TIMEOUT_FRACTION_OF_VISIBILITY)
                      })
                  ),
                  concurrency: envs.NANGO_AUDIT_CONSUMER_CONCURRENCY,
                  maxMessages: envs.NANGO_AUDIT_CONSUMER_MAX_MESSAGES,
                  waitTimeSeconds: envs.NANGO_AUDIT_CONSUMER_WAIT_TIME_SECONDS,
                  visibilityTimeoutSeconds: envs.NANGO_AUDIT_CONSUMER_VISIBILITY_TIMEOUT_SECONDS
              })
            : null;
    if (auditProc) {
        auditProc.start();
    } else {
        logger.info('Audit consumer not started: needs the sns-sqs transport, CLICKHOUSE_URL and the audit queue URL');
    }

    // Crons
    exportUsageCron();
    billingEventsS3ExportCron();
    billingEventsS3DLQMonitorCron();
    const e2bSandboxesDaemonHandle = e2bSandboxesDaemon();

    // Graceful shutdown
    const close = once(async () => {
        await e2bSandboxesDaemonHandle?.abort();
        await auditProc?.stop();
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
        await destroyFeatureFlags();
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
