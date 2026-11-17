import tracer from 'dd-trace';

import { hostedTelemetryDb, storedMetricNames } from '@nangohq/hosted-telemetry';
import { licensePublicKey, verifyLicense } from '@nangohq/license';
import { cancellableDaemon, Err, flags, getLogger, normalizePem, Ok } from '@nangohq/utils';

import { envs } from '../../env.js';
import { mintInstallationToken } from '../token.js';
import { fillUploadQueue, uploadNextPage } from '../uploader.js';

import type { UploaderConfig } from '../uploader.js';
import type { Result } from '@nangohq/utils';

const logger = getLogger('daemon.uploadTelemetry');

// A tick sends one page, so this is also the wait between two requests to Nango.
const TICK_INTERVAL_MS = 10_000;
// How often we look for new days to upload. With nothing to upload, or after a failure, we wait until then.
const FILL_INTERVAL_MS = 60 * 60 * 1000;

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
    if (!envs.NANGO_INSTALLATION_PRIVATE_KEY) {
        return Err(new Error('NANGO_INSTALLATION_PRIVATE_KEY is not set'));
    }
    const privateKeyPem = normalizePem(envs.NANGO_INSTALLATION_PRIVATE_KEY);
    try {
        await mintInstallationToken(privateKeyPem, { body: new Uint8Array() });
    } catch (err) {
        return Err(new Error(`NANGO_INSTALLATION_PRIVATE_KEY cannot sign an installation token: ${err instanceof Error ? err.message : String(err)}`));
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
        privateKeyPem,
        url: envs.NANGO_INSTALLATIONS_API_URL,
        backfillDays: envs.NANGO_HOSTED_TELEMETRY_UPLOAD_BACKFILL_DAYS,
        metrics: storedMetricNames(),
        licenseGraceUntil: new Date(license.value.grace_until)
    });
}

export function uploadTelemetryTick(config: UploaderConfig): () => Promise<void> {
    let nextFillAt = 0;
    let resting = false;

    return async () => {
        const now = Date.now();
        const fillDue = now >= nextFillAt;
        if (resting && !fillDue) {
            return;
        }
        if (config.licenseGraceUntil.getTime() <= now) {
            logger.warning(`Not uploading (the grace period of the license ended on ${config.licenseGraceUntil.toISOString()})`);
            nextFillAt = now + FILL_INTERVAL_MS;
            resting = true;
            return;
        }
        await tracer.trace('nango.self_hosting.daemon.uploadTelemetry', async (span) => {
            if (fillDue) {
                nextFillAt = now + FILL_INTERVAL_MS;
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
            const step = await uploadNextPage(config);
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
            } else if (upload.outcome === 'failed') {
                span?.setTag('error', upload.rejection);
                logger.error(`Upload of ${upload.metric} for ${upload.day} failed and will not be retried. Request the data manually`, upload.rejection);
            }
        });
    };
}
