import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { hostedTelemetryDb } from '@nangohq/hosted-telemetry';
import { getLocking } from '@nangohq/kvstore';
import { licensePublicKey, verifyLicense } from '@nangohq/license';
import { Err, flags, getLogger, Ok } from '@nangohq/utils';

import { envs } from '../../env.js';
import { mintInstallationToken } from '../token.js';
import { uploadPendingDays } from '../uploader.js';

import type { UploaderConfig } from '../uploader.js';
import type { Lock } from '@nangohq/kvstore';
import type { Result } from '@nangohq/utils';

const logger = getLogger('cron.uploadTelemetry');

const LOCK_KEY = 'lock:cron:uploadTelemetry';
// Cron fires hourly; lock should expire well before the next tick.
const lockTtlMs = 30 * 60 * 1000;

// A day's last rows are written within a minute of midnight UTC, so past the quarter hour the day before is complete.
const FIRST_MINUTE = 15;

export async function uploadTelemetryCron(): Promise<void> {
    if (!flags.hasHostedTelemetryUpload) {
        logger.info('Skipping (FLAG_HOSTED_TELEMETRY_UPLOAD_ENABLED is not set)');
        return;
    }
    const config = await uploaderConfig();
    if (config.isErr()) {
        logger.warning(`Skipping (${config.error.message})`);
        return;
    }

    // A minute of its own, so installations do not all call at the same time.
    const minute = FIRST_MINUTE + Math.floor(Math.random() * (60 - FIRST_MINUTE));
    cron.schedule(`${minute} * * * *`, () => {
        exec(config.value).catch((err: unknown) => {
            logger.error('Cron tick failed unexpectedly', err);
        });
    });
}

export async function uploaderConfig(): Promise<Result<UploaderConfig>> {
    if (!envs.NANGO_INSTALLATION_PRIVATE_KEY) {
        return Err(new Error('NANGO_INSTALLATION_PRIVATE_KEY is not set'));
    }
    try {
        await mintInstallationToken(envs.NANGO_INSTALLATION_PRIVATE_KEY, { body: new Uint8Array() });
    } catch {
        return Err(new Error('NANGO_INSTALLATION_PRIVATE_KEY cannot sign an installation token'));
    }
    if (!envs.NANGO_LICENSE) {
        return Err(new Error('NANGO_LICENSE is not set'));
    }
    if (!licensePublicKey) {
        return Err(new Error('this build trusts no license key'));
    }
    const license = await verifyLicense(envs.NANGO_LICENSE, licensePublicKey);
    if (license.isErr()) {
        return Err(new Error(`the license does not verify: ${license.error.message}`));
    }
    if (!license.value.telemetry) {
        return Err(new Error('the license does not include telemetry'));
    }
    const knex = hostedTelemetryDb();
    if (!knex) {
        return Err(new Error('hosted telemetry has no database'));
    }
    return Ok({
        knex,
        installationId: license.value.installation_id,
        privateKeyPem: envs.NANGO_INSTALLATION_PRIVATE_KEY,
        url: envs.NANGO_INSTALLATIONS_API_URL
    });
}

export async function exec(config: UploaderConfig): Promise<void> {
    await tracer.trace<Promise<void>>('nango.cron.uploadTelemetry', async (span) => {
        logger.info('Starting');
        await withLock(async () => {
            const uploaded = await uploadPendingDays(config);
            if (uploaded.isErr()) {
                span?.setTag('error', uploaded.error);
                logger.error('Stopped before the end, what is left goes out on the next run', uploaded.error);
                return;
            }
            logger.info(`Done: ${uploaded.value.succeeded} succeeded, ${uploaded.value.failed} failed`);
        });
    });
}

async function withLock(fn: () => Promise<void>): Promise<void> {
    const locking = await getLocking();
    let lock: Lock;
    try {
        lock = await locking.acquire(LOCK_KEY, lockTtlMs);
    } catch {
        logger.info('Could not acquire lock, skipping');
        return;
    }
    try {
        await fn();
    } finally {
        try {
            await locking.release(lock);
        } catch (err) {
            logger.error('Error releasing lock', { lock: lock.key, error: err });
        }
    }
}
