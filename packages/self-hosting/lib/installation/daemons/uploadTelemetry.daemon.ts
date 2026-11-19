import tracer from 'dd-trace';

import { hostedTelemetryDb, storedMetricNames } from '@nangohq/hosted-telemetry';
import { cancellableDaemon, Err, flags, getLogger, Ok } from '@nangohq/utils';

import { envs } from '../../env.js';
import { installationLicense, installationPrivateKey } from '../identity.js';
import { fillUploadQueue, uploadNextPage } from '../uploader.js';

import type { UploaderConfig } from '../uploader.js';
import type { Result } from '@nangohq/utils';

const logger = getLogger('daemon.uploadTelemetry');

// A tick sends one page, so this is also the wait between two requests to Nango.
const TICK_INTERVAL_MS = 10_000;
// A loop starts by queueing the new days. With nothing left to upload, or after a failure, we wait for the next loop.
// An upload that Nango rejected is sent again once per loop.
const LOOP_INTERVAL_MS = 60 * 60 * 1000;

export async function uploadTelemetryDaemon(): Promise<{ abort: () => Promise<void> } | undefined> {
    if (!flags.hasHostedTelemetryUpload) {
        logger.info('Skipping (FLAG_HOSTED_TELEMETRY_UPLOAD_ENABLED is not set)');
        return;
    }
    const config = await uploaderConfig();
    if (config.isErr()) {
        logger.warning(`Skipping (${config.error.message})`);
        return;
    }
    if (!config.value) {
        logger.info('Skipping (the license does not ask for telemetry)');
        return;
    }

    logger.info(`Uploading telemetry to ${config.value.url}`);
    return cancellableDaemon({
        tickIntervalMs: TICK_INTERVAL_MS,
        tick: uploadTelemetryTick(config.value),
        onError: (err) => {
            logger.error('Tick failed unexpectedly', err);
        }
    });
}

/** Returns no configuration when the license does not ask for telemetry. */
export async function uploaderConfig(): Promise<Result<UploaderConfig | null>> {
    const license = await installationLicense();
    if (license.isErr()) {
        return Err(license.error);
    }
    if (!license.value.telemetry) {
        return Ok(null);
    }
    const privateKeyPem = await installationPrivateKey();
    if (privateKeyPem.isErr()) {
        return Err(privateKeyPem.error);
    }
    if (!envs.NANGO_INSTALLATIONS_API_URL) {
        return Err(new Error('NANGO_INSTALLATIONS_API_URL is not set'));
    }
    const knex = hostedTelemetryDb();
    if (!knex) {
        return Err(new Error('hosted telemetry has no database'));
    }
    return Ok({
        knex,
        installationId: license.value.installation_id,
        privateKeyPem: privateKeyPem.value,
        url: envs.NANGO_INSTALLATIONS_API_URL,
        backfillDays: envs.NANGO_HOSTED_TELEMETRY_UPLOAD_BACKFILL_DAYS,
        metrics: storedMetricNames(),
        licenseGraceUntil: new Date(license.value.grace_until)
    });
}

export function uploadTelemetryTick(config: UploaderConfig): () => Promise<void> {
    let loopStartedAt = 0;
    let resting = false;

    return async () => {
        const now = Date.now();
        const loopDue = now >= loopStartedAt + LOOP_INTERVAL_MS;
        if (resting && !loopDue) {
            return;
        }
        if (config.licenseGraceUntil.getTime() <= now) {
            logger.warning(`Not uploading (the grace period of the license ended on ${config.licenseGraceUntil.toISOString()})`);
            loopStartedAt = now;
            resting = true;
            return;
        }
        await tracer.trace('nango.self_hosting.daemon.uploadTelemetry', async (span) => {
            if (loopDue) {
                loopStartedAt = now;
                const filled = await fillUploadQueue(config);
                if (filled.isErr()) {
                    span?.setTag('error', filled.error);
                    logger.error('Could not fill the upload queue. Uploading what is already queued', filled.error);
                } else if (filled.value.expired > 0) {
                    logger.error(
                        `${filled.value.expired} uploads are older than ${config.backfillDays} days and were marked as failed. Request the data manually`
                    );
                }
            }
            const step = await uploadNextPage(config, { rejectedBefore: new Date(loopStartedAt) });
            if (step.isErr()) {
                span?.setTag('error', step.error);
                logger.error('Uploading stopped. The rest will be uploaded later', step.error);
                resting = true;
                return;
            }
            const upload = step.value;
            span?.setTag('outcome', upload.outcome);
            resting = upload.outcome === 'idle';
            if (upload.outcome === 'idle') {
                return;
            }
            span?.addTags({ metric: upload.metric, day: upload.day });
            if (upload.outcome === 'finished') {
                logger.info(`Uploaded ${upload.metric} for ${upload.day}`);
            } else if (upload.outcome === 'rejected') {
                span?.setTag('error', upload.rejection);
                logger.error(`Nango rejected ${upload.metric} for ${upload.day}. It will be sent again later`, upload.rejection);
            }
        });
    };
}
