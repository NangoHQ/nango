import { signLicense } from '@nangohq/license';
import { Err, Ok } from '@nangohq/utils';

import { createInstallationLicense } from './installation-license.service.js';

import type { LicenseSigner } from '../licensing/signer.js';
import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallation, DBSelfHostingInstallationLicense, License } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export async function issueLicense(
    db: RegistryDb,
    { installation, signer, expiresAt, graceUntil }: { installation: DBSelfHostingInstallation; signer: LicenseSigner; expiresAt: Date; graceUntil: Date }
): Promise<Result<{ license: string; row: DBSelfHostingInstallationLicense }>> {
    const issuedAt = new Date();
    const payload: License = {
        version: 1,
        installation_id: installation.uuid,
        name: installation.name,
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        grace_until: graceUntil.toISOString(),
        telemetry: installation.telemetry
    };

    let envelope: string;
    try {
        envelope = await signLicense(payload, signer);
    } catch (err) {
        return Err(err);
    }
    const [header = '', , signature = ''] = envelope.split('.');
    const { kid } = JSON.parse(Buffer.from(header, 'base64url').toString()) as { kid: string };

    const stored = await createInstallationLicense(db, {
        installationId: installation.id,
        issuedAt,
        expiresAt,
        graceUntil,
        license: envelope,
        signature,
        signingKid: kid
    });
    return stored.isErr() ? Err(stored.error) : Ok({ license: envelope, row: stored.value });
}
