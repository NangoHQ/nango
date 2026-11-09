import { createPublicKey } from 'node:crypto';

import { decodeProtectedHeader, errors, jwtVerify } from 'jose';

import { Err, Ok } from '@nangohq/utils';

import { INSTALLATION_TOKEN_CLOCK_TOLERANCE, INSTALLATION_TOKEN_LIFETIME } from '../../installation/token.js';
import { INSTALLATION_KEYS_TABLE, INSTALLATIONS_TABLE } from '../db/schema.js';
import { table } from './db.js';
import { getInstallationKey } from './installation-key.service.js';
import { getActiveLicense } from './installation-license.service.js';
import { getInstallation } from './installation.service.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallation, DBSelfHostingInstallationKey } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type InstallationTokenErrorCode =
    | 'malformed'
    | 'unknown_key'
    | 'invalid_signature'
    | 'clock_skew'
    | 'no_installation'
    | 'no_license'
    | 'registry_unavailable';

export class InstallationTokenError extends Error {
    public readonly code: InstallationTokenErrorCode;

    constructor(code: InstallationTokenErrorCode, message: string) {
        super(message);
        this.name = 'InstallationTokenError';
        this.code = code;
    }
}

const ALGORITHM = 'EdDSA';

/** Resolves a token to its live, licensed installation and records the use. */
export async function verifyInstallationToken(db: RegistryDb, token: string): Promise<Result<DBSelfHostingInstallation, InstallationTokenError>> {
    let kid: string | undefined;
    try {
        kid = decodeProtectedHeader(token).kid;
    } catch {
        return Err(new InstallationTokenError('malformed', 'token is not a JWT'));
    }
    if (!kid) {
        return Err(new InstallationTokenError('malformed', 'token names no key'));
    }

    const key = await getInstallationKey(db, { kid });
    if (key.isErr()) {
        return Err(new InstallationTokenError('registry_unavailable', key.error.message));
    }
    if (!key.value) {
        return Err(new InstallationTokenError('unknown_key', `no live key ${kid}`));
    }

    try {
        await jwtVerify(token, createPublicKey(key.value.public_key), {
            algorithms: [ALGORITHM],
            maxTokenAge: INSTALLATION_TOKEN_LIFETIME,
            clockTolerance: INSTALLATION_TOKEN_CLOCK_TOLERANCE
        });
    } catch (err) {
        if (err instanceof errors.JWTExpired) {
            return Err(new InstallationTokenError('clock_skew', "token expired by our clock, check the installation's clock"));
        }
        if (err instanceof errors.JWTClaimValidationFailed && err.claim === 'iat' && err.reason === 'check_failed') {
            return Err(new InstallationTokenError('clock_skew', "token issued in the future by our clock, check the installation's clock"));
        }
        if (err instanceof errors.JWSSignatureVerificationFailed) {
            return Err(new InstallationTokenError('invalid_signature', `token signature does not verify with key ${kid}`));
        }
        return Err(new InstallationTokenError('malformed', err instanceof Error ? err.message : 'token is not a JWT'));
    }

    const installation = await getInstallation(db, { id: key.value.installation_id });
    if (installation.isErr()) {
        return Err(new InstallationTokenError('registry_unavailable', installation.error.message));
    }
    if (!installation.value) {
        return Err(new InstallationTokenError('no_installation', `key ${kid} belongs to a deleted installation`));
    }

    const license = await getActiveLicense(db, { installationId: installation.value.id });
    if (license.isErr()) {
        return Err(new InstallationTokenError('registry_unavailable', license.error.message));
    }
    if (!license.value) {
        return Err(new InstallationTokenError('no_license', `installation ${installation.value.uuid} has no active license`));
    }

    const now = new Date();
    try {
        await table<DBSelfHostingInstallationKey>(db, INSTALLATION_KEYS_TABLE).where({ id: key.value.id }).update({ last_used_at: now });
        await table<DBSelfHostingInstallation>(db, INSTALLATIONS_TABLE).where({ id: installation.value.id }).update({ last_seen_at: now });
    } catch (err) {
        return Err(new InstallationTokenError('registry_unavailable', err instanceof Error ? err.message : String(err)));
    }
    return Ok({ ...installation.value, last_seen_at: now });
}
