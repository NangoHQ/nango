import { licensePublicKey, verifyLicense } from '@nangohq/license';
import { getLogger, isCloud } from '@nangohq/utils';

import { envs } from './env.js';

import type { InstallationLicense } from '@nangohq/types';

const logger = getLogger('Server');

/** Checks the license against the clock on every call, so an expiry shows without a restart. */
export async function evaluateLicense(publicKeyPem: string, now = new Date()): Promise<InstallationLicense> {
    if (!envs.NANGO_LICENSE) {
        return { status: 'missing' };
    }
    const verified = await verifyLicense(envs.NANGO_LICENSE, publicKeyPem);
    if (verified.isErr()) {
        return { status: 'invalid', reason: verified.error.message };
    }
    const license = verified.value;
    if (now > new Date(license.grace_until)) {
        return { status: 'grace_ended', license };
    }
    if (now > new Date(license.expires_at)) {
        return { status: 'expired', license };
    }
    return { status: 'valid', license };
}

export async function checkEnterpriseLicense(): Promise<void> {
    if (isCloud || !licensePublicKey) {
        return;
    }
    if (!envs.NANGO_LICENSE_CHECK) {
        logger.info('License check disabled: NANGO_LICENSE_CHECK is false.');
        return;
    }

    const result = await evaluateLicense(licensePublicKey);
    switch (result.status) {
        case 'missing':
            logger.warning('License check failed: NANGO_LICENSE is not set.');
            return;
        case 'invalid':
            logger.warning(`License check failed: ${result.reason}.`);
            return;
        case 'grace_ended': {
            const { name, expires_at, grace_until } = result.license;
            logger.warning(`License check failed: license for ${name} expired on ${expires_at} and its grace period ended on ${grace_until}.`);
            return;
        }
        case 'expired': {
            const { name, installation_id, expires_at, grace_until } = result.license;
            logger.warning(`License for ${name} (${installation_id}) expired on ${expires_at}. Renew it before ${grace_until}.`);
            return;
        }
        case 'valid': {
            const { name, installation_id, expires_at } = result.license;
            logger.info(`License for ${name} (${installation_id}) is valid until ${expires_at}.`);
            return;
        }
    }
}
