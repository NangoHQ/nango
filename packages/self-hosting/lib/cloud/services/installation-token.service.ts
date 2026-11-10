import { createPublicKey } from 'node:crypto';

import { decodeProtectedHeader, errors, jwtVerify } from 'jose';

import { Err, Ok } from '@nangohq/utils';

import {
    INSTALLATION_TOKEN_CLOCK_TOLERANCE,
    INSTALLATION_TOKEN_LIFETIME,
    INSTALLATION_TOKEN_TYPE,
    INSTALLATION_TOKEN_VERSION
} from '../../installation/token.js';
import { logger } from '../../utils.js';
import { getInstallationKey, markInstallationKeyUsed } from './installation-key.service.js';
import { getActiveLicense } from './installation-license.service.js';
import { markInstallationSeen, searchInstallations } from './installation.service.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallation } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JWTPayload } from 'jose';

export type InstallationTokenErrorCode =
    | 'malformed'
    | 'unknown_key'
    | 'invalid_signature'
    | 'clock_skew'
    | 'body_mismatch'
    | 'no_installation'
    | 'no_license'
    | 'license_expired'
    | 'registry_unavailable';

export class InstallationTokenError extends Error {
    public readonly code: InstallationTokenErrorCode;

    constructor(code: InstallationTokenErrorCode, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'InstallationTokenError';
        this.code = code;
    }
}

const ALGORITHM = 'EdDSA';

const registryUnavailable = (cause: unknown) => new InstallationTokenError('registry_unavailable', 'the registry is unavailable', { cause });

/** Resolves a token to its live, licensed installation, for the request body it was minted for, and records the use. */
export async function verifyInstallationToken(
    db: RegistryDb,
    { token, bodySha256 }: { token: string; bodySha256: string }
): Promise<Result<DBSelfHostingInstallation, InstallationTokenError>> {
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
        return Err(registryUnavailable(key.error));
    }
    if (!key.value) {
        return Err(new InstallationTokenError('unknown_key', `no live key ${kid}`));
    }

    let claims: JWTPayload;
    try {
        ({ payload: claims } = await jwtVerify(token, createPublicKey(key.value.public_key), {
            algorithms: [ALGORITHM],
            typ: INSTALLATION_TOKEN_TYPE,
            maxTokenAge: INSTALLATION_TOKEN_LIFETIME,
            clockTolerance: INSTALLATION_TOKEN_CLOCK_TOLERANCE
        }));
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
    if (claims['ver'] !== INSTALLATION_TOKEN_VERSION) {
        return Err(new InstallationTokenError('malformed', 'unsupported token version'));
    }
    if (claims['body_sha256'] !== bodySha256) {
        return Err(new InstallationTokenError('body_mismatch', 'token was not minted for this request body'));
    }

    const installations = await searchInstallations(db, { id: key.value.installation_id });
    if (installations.isErr()) {
        return Err(registryUnavailable(installations.error));
    }
    const [installation] = installations.value;
    if (!installation) {
        return Err(new InstallationTokenError('no_installation', `key ${kid} belongs to a deleted installation`));
    }

    const license = await getActiveLicense(db, { installationId: installation.id });
    if (license.isErr()) {
        return Err(registryUnavailable(license.error));
    }
    if (!license.value) {
        return Err(new InstallationTokenError('no_license', `installation ${installation.uuid} has no active license`));
    }
    const now = new Date();
    if (license.value.grace_until <= now) {
        return Err(new InstallationTokenError('license_expired', `the license of installation ${installation.uuid} is past its grace period`));
    }

    const stamps = await Promise.all([markInstallationKeyUsed(db, { id: key.value.id, at: now }), markInstallationSeen(db, { id: installation.id, at: now })]);
    for (const stamp of stamps) {
        if (stamp.isErr()) {
            logger.warning('Failed to record the use of an installation token', stamp.error);
        }
    }
    return Ok(installation);
}
