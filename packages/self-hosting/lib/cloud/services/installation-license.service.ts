import { Err, Ok } from '@nangohq/utils';

import { INSTALLATION_LICENSES_TABLE } from '../db/schema.js';
import { inserted, table } from './db.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallationLicense } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const licenses = (db: RegistryDb) => table<DBSelfHostingInstallationLicense>(db, INSTALLATION_LICENSES_TABLE);

/** Replaces the active license: the previous one stays in the table, inactive. */
export async function createInstallationLicense(
    db: RegistryDb,
    {
        installationId,
        issuedAt,
        expiresAt,
        graceUntil,
        license,
        signature,
        signingKid
    }: {
        installationId: number;
        issuedAt: Date;
        expiresAt: Date;
        graceUntil: Date;
        license: string;
        signature: string;
        signingKid: string;
    }
): Promise<Result<DBSelfHostingInstallationLicense>> {
    try {
        return Ok(
            await db.knex.transaction(async (trx) => {
                const inTrx = { ...db, knex: trx };
                await licenses(inTrx).where({ installation_id: installationId, active: true }).update({ active: false });
                const row = await licenses(inTrx)
                    .insert({
                        installation_id: installationId,
                        issued_at: issuedAt,
                        expires_at: expiresAt,
                        grace_until: graceUntil,
                        license,
                        signature,
                        signing_kid: signingKid
                    })
                    .returning('*');
                return inserted(row);
            })
        );
    } catch (err) {
        return Err(err);
    }
}

export async function getActiveLicense(
    db: RegistryDb,
    { installationId }: { installationId: number }
): Promise<Result<DBSelfHostingInstallationLicense | null>> {
    try {
        return Ok((await licenses(db).where({ installation_id: installationId, active: true }).first()) ?? null);
    } catch (err) {
        return Err(err);
    }
}

export async function deactivateLicense(db: RegistryDb, { installationId }: { installationId: number }): Promise<Result<DBSelfHostingInstallationLicense>> {
    try {
        const [row] = await licenses(db).where({ installation_id: installationId, active: true }).update({ active: false }).returning('*');
        return row ? Ok(row) : Err(new Error(`installation ${installationId} has no active license`));
    } catch (err) {
        return Err(err);
    }
}

export async function listLicenses(db: RegistryDb, { installationId }: { installationId: number }): Promise<Result<DBSelfHostingInstallationLicense[]>> {
    try {
        return Ok(await licenses(db).where({ installation_id: installationId }).orderBy('id'));
    } catch (err) {
        return Err(err);
    }
}
