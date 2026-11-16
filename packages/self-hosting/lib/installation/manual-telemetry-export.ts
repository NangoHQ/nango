import { createHash } from 'node:crypto';

import { SignJWT } from 'jose';

import { hostedTelemetryDb, storedMetricNames } from '@nangohq/hosted-telemetry';
import { Err, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { installationLicense, installationPrivateKey } from './identity.js';
import { signingKey } from './token.js';
import { telemetryRowLine } from './uploader.js';

import type { MetricRow } from '@nangohq/hosted-telemetry';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export const INSTALLATION_EXPORT_SIGNATURE_TYPE = 'nango-installation-export+jwt';
export const INSTALLATION_EXPORT_SIGNATURE_VERSION = 1;

export interface ManualTelemetryExportHeader {
    kind: 'header';
    installation_id: string;
    from: string;
    to: string;
    /** The metrics this installation records. One that is here and has no row in the file had nothing to report. */
    metrics: string[];
}

export interface ManualTelemetryExportTrailer {
    kind: 'trailer';
    signature: string;
}

export interface ManualTelemetryExportConfig {
    key: string;
    knex: Knex;
    schema?: string;
    installationId: string;
    privateKeyPem: string;
    metrics: string[];
    retentionDays: number;
}

/** Returns no configuration when the installation has no export key, which is how the export is turned off. */
export async function manualTelemetryExportConfig(): Promise<Result<ManualTelemetryExportConfig | null>> {
    const key = envs.NANGO_HOSTED_TELEMETRY_MANUAL_EXPORT_KEY;
    if (!key) {
        return Ok(null);
    }
    const license = await installationLicense();
    if (license.isErr()) {
        return Err(license.error);
    }
    const privateKeyPem = await installationPrivateKey();
    if (privateKeyPem.isErr()) {
        return Err(privateKeyPem.error);
    }
    const knex = hostedTelemetryDb();
    if (!knex) {
        return Err(new Error('hosted telemetry has no database'));
    }
    return Ok({
        key,
        knex,
        installationId: license.value.installation_id,
        privateKeyPem: privateKeyPem.value,
        metrics: storedMetricNames(),
        retentionDays: envs.NANGO_HOSTED_TELEMETRY_POSTGRES_RETENTION_DAYS
    });
}

/**
 * Signs an export file by the SHA-256 of its content. The signature has its own type, so it is never accepted as an
 * installation token, and it does not expire: a file can be checked long after it was written.
 */
export async function signManualTelemetryExport(privateKeyPem: string, { bodySha256 }: { bodySha256: string }): Promise<string> {
    const { key, kid } = await signingKey(privateKeyPem);
    return new SignJWT({ ver: INSTALLATION_EXPORT_SIGNATURE_VERSION, body_sha256: bodySha256 })
        .setProtectedHeader({ alg: 'EdDSA', typ: INSTALLATION_EXPORT_SIGNATURE_TYPE, kid })
        .setIssuedAt()
        .sign(key);
}

/**
 * Writes an export file: a header, one line per row, and a trailer that signs the SHA-256 of every byte above it. The
 * rows are written as they are read, so the signature can only come last, and a file without its trailer is not
 * complete. The first chunk already holds the first page of rows, so a failing read is known before anything is sent.
 */
export async function* writeManualTelemetryExport({
    pages,
    installationId,
    privateKeyPem,
    metrics,
    from,
    to
}: {
    pages: AsyncIterable<MetricRow[]>;
    installationId: string;
    privateKeyPem: string;
    metrics: string[];
    from: Date;
    to: Date;
}): AsyncGenerator<string> {
    const hash = createHash('sha256');
    const header: ManualTelemetryExportHeader = { kind: 'header', installation_id: installationId, from: from.toISOString(), to: to.toISOString(), metrics };
    let chunk = `${JSON.stringify(header)}\n`;
    for await (const page of pages) {
        for (const row of page) {
            chunk += `${telemetryRowLine(row)}\n`;
        }
        hash.update(chunk);
        yield chunk;
        chunk = '';
    }
    hash.update(chunk);
    const trailer: ManualTelemetryExportTrailer = {
        kind: 'trailer',
        signature: await signManualTelemetryExport(privateKeyPem, { bodySha256: hash.digest('base64url') })
    };
    yield `${chunk}${JSON.stringify(trailer)}\n`;
}
