import { licensePublicKey, verifyLicense } from '@nangohq/license';
import { Err, normalizePem, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { mintInstallationToken } from './token.js';

import type { License } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/** The license of this installation, checked against the key this build trusts. */
export async function installationLicense(): Promise<Result<License>> {
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
    return Ok(license.value);
}

/** The private key of this installation, once we know it can sign. */
export async function installationPrivateKey(): Promise<Result<string>> {
    if (!envs.NANGO_INSTALLATION_PRIVATE_KEY) {
        return Err(new Error('NANGO_INSTALLATION_PRIVATE_KEY is not set'));
    }
    const privateKeyPem = normalizePem(envs.NANGO_INSTALLATION_PRIVATE_KEY);
    try {
        await mintInstallationToken(privateKeyPem, { body: new Uint8Array() });
    } catch (err) {
        return Err(new Error(`NANGO_INSTALLATION_PRIVATE_KEY cannot sign an installation token: ${err instanceof Error ? err.message : String(err)}`));
    }
    return Ok(privateKeyPem);
}
