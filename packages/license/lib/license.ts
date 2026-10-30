import { createPublicKey } from 'node:crypto';

import { derToJose } from 'ecdsa-sig-formatter';
import { base64url, calculateJwkThumbprint, compactVerify, decodeProtectedHeader, errors, exportJWK } from 'jose';
import * as z from 'zod';

import { Err, Ok } from '@nangohq/utils';

import type { License } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type LicenseErrorCode = 'malformed' | 'unsupported_algorithm' | 'unknown_key_id' | 'invalid_signature' | 'invalid_license';

export class LicenseError extends Error {
    public readonly code: LicenseErrorCode;

    constructor(code: LicenseErrorCode, message: string) {
        super(message);
        this.name = 'LicenseError';
        this.code = code;
    }
}

const licenseSchema = z.object({
    version: z.literal(1),
    installation_id: z.uuid(),
    name: z.string().min(1),
    issued_at: z.iso.datetime(),
    expires_at: z.iso.datetime(),
    grace_until: z.iso.datetime(),
    telemetry: z.boolean()
});

const ALGORITHM = 'ES256';

export function parseLicense(input: unknown): Result<License, LicenseError> {
    const parsed = licenseSchema.safeParse(input);
    if (!parsed.success) {
        return Err(new LicenseError('invalid_license', z.prettifyError(parsed.error)));
    }
    return Ok(parsed.data);
}

function licenseKeyId(publicKeyPem: string): Promise<string> {
    return exportJWK(createPublicKey(publicKeyPem)).then(calculateJwkThumbprint);
}

/** Builds a signed license for one installation. The private key lives in KMS, so the caller passes `sign`, which returns KMS's DER signature. */
export async function signLicense(
    license: License,
    { publicKeyPem, sign }: { publicKeyPem: string; sign: (data: Buffer) => Promise<Buffer> }
): Promise<string> {
    const header = base64url.encode(JSON.stringify({ alg: ALGORITHM, kid: await licenseKeyId(publicKeyPem) }));
    const payload = base64url.encode(JSON.stringify(license));
    const signature = await sign(Buffer.from(`${header}.${payload}`));
    const envelope = `${header}.${payload}.${derToJose(signature, ALGORITHM)}`;

    const verified = await verifyLicense(envelope, publicKeyPem);
    if (verified.isErr()) {
        throw new LicenseError(verified.error.code, `signed license does not verify with the given public key: ${verified.error.message}`);
    }
    return envelope;
}

/** Checks that a license was signed by us. Expiry is not checked here. */
export async function verifyLicense(envelope: string, publicKeyPem: string): Promise<Result<License, LicenseError>> {
    const key = createPublicKey(publicKeyPem);

    let kid: string | undefined;
    try {
        kid = decodeProtectedHeader(envelope).kid;
    } catch {
        return Err(new LicenseError('malformed', 'license is not a compact JWS'));
    }

    const expectedKeyId = await licenseKeyId(publicKeyPem);
    if (kid !== expectedKeyId) {
        return Err(new LicenseError('unknown_key_id', `license signed by key ${kid ?? 'without an id'}, this build trusts ${expectedKeyId}`));
    }

    let payload: Uint8Array;
    try {
        ({ payload } = await compactVerify(envelope, key, { algorithms: [ALGORITHM] }));
    } catch (err) {
        if (err instanceof errors.JOSEAlgNotAllowed) {
            return Err(new LicenseError('unsupported_algorithm', err.message));
        }
        if (err instanceof errors.JWSSignatureVerificationFailed) {
            return Err(new LicenseError('invalid_signature', 'license signature does not verify'));
        }
        return Err(new LicenseError('malformed', 'license is not a compact JWS'));
    }

    try {
        return parseLicense(JSON.parse(Buffer.from(payload).toString()));
    } catch {
        return Err(new LicenseError('invalid_license', 'license payload is not JSON'));
    }
}
