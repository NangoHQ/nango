import { signLicense } from '@nangohq/license';
import { Err, Ok } from '@nangohq/utils';

import { createCustomer, getCustomerByName } from './customer.service.js';
import { createInstallationKey } from './installation-key.service.js';
import { createInstallationLicense, deactivateLicense } from './installation-license.service.js';
import { createInstallation, getInstallationByUuid } from './installation.service.js';

import type { LicenseSigner } from '../licensing/signer.js';
import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallation, DBSelfHostingInstallationLicense, License } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface IssuedKey {
    kid: string;
    privateKeyPem: string;
}

export async function issueLicense(
    db: RegistryDb,
    { installation, signer, expiresAt, graceUntil }: { installation: DBSelfHostingInstallation; signer: LicenseSigner; expiresAt: Date; graceUntil: Date }
): Promise<Result<{ envelope: string; license: DBSelfHostingInstallationLicense }>> {
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
    return stored.isErr() ? Err(stored.error) : Ok({ envelope, license: stored.value });
}

export async function onboardInstallation(
    db: RegistryDb,
    {
        customer,
        name,
        mode,
        stage,
        telemetry,
        alerts,
        expiresAt,
        graceUntil,
        signer
    }: {
        customer: string;
        name: string;
        mode: DBSelfHostingInstallation['mode'];
        stage: DBSelfHostingInstallation['stage'];
        telemetry?: boolean;
        alerts?: DBSelfHostingInstallation['alerts'];
        expiresAt: Date;
        graceUntil: Date;
        signer: LicenseSigner;
    }
): Promise<Result<{ installation: DBSelfHostingInstallation; key: IssuedKey; envelope: string }>> {
    try {
        return Ok(
            await db.knex.transaction(async (trx) => {
                const inTrx = { ...db, knex: trx };
                const customerRow = (await getCustomerByName(inTrx, { name: customer })).unwrap() ?? (await createCustomer(inTrx, { name: customer })).unwrap();
                const installation = (
                    await createInstallation(inTrx, {
                        customerId: customerRow.id,
                        name,
                        mode,
                        stage,
                        ...(telemetry !== undefined && { telemetry }),
                        ...(alerts && { alerts })
                    })
                ).unwrap();
                const { key, privateKeyPem } = (await createInstallationKey(inTrx, { installationId: installation.id })).unwrap();
                const { envelope } = (await issueLicense(inTrx, { installation, signer, expiresAt, graceUntil })).unwrap();
                return { installation, key: { kid: key.kid, privateKeyPem }, envelope };
            })
        );
    } catch (err) {
        return Err(err);
    }
}

async function liveInstallation(db: RegistryDb, uuid: string): Promise<Result<DBSelfHostingInstallation>> {
    const found = await getInstallationByUuid(db, { uuid });
    if (found.isErr()) {
        return Err(found.error);
    }
    return found.value ? Ok(found.value) : Err(new Error(`no live installation ${uuid}`));
}

export async function renewLicense(
    db: RegistryDb,
    { installationUuid, expiresAt, graceUntil, signer }: { installationUuid: string; expiresAt: Date; graceUntil: Date; signer: LicenseSigner }
): Promise<Result<{ envelope: string; license: DBSelfHostingInstallationLicense }>> {
    const installation = await liveInstallation(db, installationUuid);
    return installation.isErr() ? Err(installation.error) : issueLicense(db, { installation: installation.value, signer, expiresAt, graceUntil });
}

export async function rotateInstallationKey(db: RegistryDb, { installationUuid }: { installationUuid: string }): Promise<Result<IssuedKey>> {
    const installation = await liveInstallation(db, installationUuid);
    if (installation.isErr()) {
        return Err(installation.error);
    }
    const created = await createInstallationKey(db, { installationId: installation.value.id });
    return created.isErr() ? Err(created.error) : Ok({ kid: created.value.key.kid, privateKeyPem: created.value.privateKeyPem });
}

export async function disableInstallation(db: RegistryDb, { installationUuid }: { installationUuid: string }): Promise<Result<void>> {
    const installation = await liveInstallation(db, installationUuid);
    return installation.isErr() ? Err(installation.error) : deactivateLicense(db, { installationId: installation.value.id });
}
