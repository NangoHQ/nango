import { licensePublicKey, verifyLicense } from '@nangohq/license';
import { getLogger, isCloud } from '@nangohq/utils';

import { envs } from './env.js';

const logger = getLogger('Server');

export async function checkEnterpriseLicense(): Promise<void> {
    if (isCloud || !licensePublicKey) {
        return;
    }
    if (!envs.NANGO_LICENSE_CHECK) {
        logger.info('License check disabled: NANGO_LICENSE_CHECK is not set.');
        return;
    }
    if (!envs.NANGO_LICENSE) {
        logger.warning('License check failed: NANGO_LICENSE is not set.');
        return;
    }

    const verified = await verifyLicense(envs.NANGO_LICENSE, licensePublicKey);
    if (verified.isErr()) {
        logger.warning(`License check failed: ${verified.error.message}.`);
        return;
    }

    const { name, installation_id, expires_at, grace_until } = verified.value;
    const now = new Date();
    if (now > new Date(grace_until)) {
        logger.warning(`License check failed: license for ${name} expired on ${expires_at} and its grace period ended on ${grace_until}.`);
        return;
    }
    if (now > new Date(expires_at)) {
        logger.warning(`License for ${name} (${installation_id}) expired on ${expires_at}. Renew it before ${grace_until}.`);
        return;
    }
    logger.info(`License for ${name} (${installation_id}) is valid until ${expires_at}.`);
}
