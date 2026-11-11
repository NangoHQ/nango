import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { hostedTelemetryDb } from '@nangohq/hosted-telemetry';
import { getLocking } from '@nangohq/kvstore';
import { licensePublicKey, verifyLicense } from '@nangohq/license';
import { Err, flags, getLogger, normalizePem, Ok } from '@nangohq/utils';

import { envs } from '../../env.js';
import { mintInstallationToken } from '../token.js';
import { uploadQueuedDays } from '../uploader.js';

import type { UploaderConfig } from '../uploader.js';
import type { Lock } from '@nangohq/kvstore';
import type { Result } from '@nangohq/utils';

const logger = getLogger('cron.uploadTelemetry');

const LOCK_KEY = 'lock:cron:uploadTelemetry';
// The cron runs every hour, so the lock must expire before the next run.
const lockTtlMs = 30 * 60 * 1000;
// A run must stop before its lock expires. Otherwise another run could start while this one is still uploading.
const RUN_BUDGET_MS = lockTtlMs - 10 * 60 * 1000;

// We start at minute 15 so that yesterday's telemetry is fully written before we send it.
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
    const uploader = config.value;
    if (!uploader) {
        logger.info('Skipping (the license does not ask for telemetry)');
        return;
    }

    // Each installation picks a random minute, so they do not all call Nango at the same time.
    const minute = FIRST_MINUTE + Math.floor(Math.random() * (60 - FIRST_MINUTE));
    cron.schedule(`${minute} * * * *`, () => {
        exec(uploader).catch((err: unknown) => {
            logger.error('Cron tick failed unexpectedly', err);
        });
    });
}

/** Returns no configuration when the license does not ask for telemetry. */
export async function uploaderConfig(): Promise<Result<UploaderConfig | null>> {
    if (!envs.NANGO_INSTALLATION_PRIVATE_KEY) {
        return Err(new Error('NANGO_INSTALLATION_PRIVATE_KEY is not set'));
    }
    const privateKeyPem = normalizePem(envs.NANGO_INSTALLATION_PRIVATE_KEY);
    try {
        await mintInstallationToken(privateKeyPem, { body: new Uint8Array() });
    } catch {
        return Err(new Error('NANGO_INSTALLATION_PRIVATE_KEY cannot sign an installation token'));
    }
    if (!envs.NANGO_LICENSE) {
        return Err(new Error('NANGO_LICENSE is not set'));
    }
    if (!licensePublicKey) {
        return Err(new Error('this build has no license public key'));
    }
    const license = await verifyLicense(envs.NANGO_LICENSE, licensePublicKey);
    if (license.isErr()) {
        return Err(new Error(`the license does not verify: ${license.error.message}`));
    }
    if (!license.value.telemetry) {
        return Ok(null);
    }
    const knex = hostedTelemetryDb();
    if (!knex) {
        return Err(new Error('hosted telemetry has no database'));
    }
    return Ok({
        knex,
        installationId: license.value.installation_id,
        privateKeyPem,
        url: envs.NANGO_INSTALLATIONS_API_URL,
        backfillDays: envs.NANGO_HOSTED_TELEMETRY_UPLOAD_BACKFILL_DAYS,
        licenseGraceUntil: new Date(license.value.grace_until)
    });
}

export async function exec(config: UploaderConfig): Promise<void> {
    if (config.licenseGraceUntil <= new Date()) {
        logger.warning(`Skipping (the grace period of the license ended on ${config.licenseGraceUntil.toISOString()})`);
        return;
    }
    await tracer.trace<Promise<void>>('nango.cron.uploadTelemetry', async (span) => {
        logger.info('Starting');
        await withLock(async () => {
            const uploaded = await uploadQueuedDays(config, { deadline: new Date(Date.now() + RUN_BUDGET_MS) });
            if (uploaded.isErr()) {
                span?.setTag('error', uploaded.error);
                logger.error('The run stopped early. The rest will be uploaded on the next run', uploaded.error);
                return;
            }
            const { succeeded, failed, outOfTime } = uploaded.value;
            logger.info(`Done: ${succeeded} succeeded, ${failed} failed${outOfTime ? ', out of time, the rest will be uploaded on the next run' : ''}`);
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
