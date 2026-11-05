import { Err, Ok } from '@nangohq/utils';

import { INSTALLATION_KEYS_TABLE, INSTALLATION_LICENSES_TABLE, INSTALLATIONS_TABLE } from '../db/schema.js';
import { inserted, isUniqueViolation, table } from './db.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallation, DBSelfHostingInstallationKey, DBSelfHostingInstallationLicense } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const installations = (db: RegistryDb) => table<DBSelfHostingInstallation>(db, INSTALLATIONS_TABLE);

export async function createInstallation(
    db: RegistryDb,
    {
        customerId,
        name,
        mode,
        stage,
        telemetry,
        alerts
    }: {
        customerId: number;
        name: string;
        mode: DBSelfHostingInstallation['mode'];
        stage: DBSelfHostingInstallation['stage'];
        telemetry?: boolean;
        alerts?: DBSelfHostingInstallation['alerts'];
    }
): Promise<Result<DBSelfHostingInstallation>> {
    try {
        const row = await installations(db)
            .insert({ customer_id: customerId, name, mode, stage, ...(telemetry !== undefined && { telemetry }), ...(alerts && { alerts }) })
            .returning('*');
        return Ok(inserted(row));
    } catch (err) {
        return Err(isUniqueViolation(err) ? new Error(`installation ${name} already exists for this customer`) : err);
    }
}

export async function getInstallationByUuid(
    db: RegistryDb,
    { uuid, includeDeleted = false }: { uuid: string; includeDeleted?: boolean }
): Promise<Result<DBSelfHostingInstallation | null>> {
    try {
        return Ok(
            (await installations(db)
                .where({ uuid, ...(!includeDeleted && { deleted_at: null }) })
                .first()) ?? null
        );
    } catch (err) {
        return Err(err);
    }
}

export async function listInstallations(
    db: RegistryDb,
    { customerId, includeDeleted = false }: { customerId?: number; includeDeleted?: boolean } = {}
): Promise<Result<DBSelfHostingInstallation[]>> {
    try {
        return Ok(
            await installations(db)
                .where({ ...(!includeDeleted && { deleted_at: null }), ...(customerId !== undefined && { customer_id: customerId }) })
                .orderBy('id')
        );
    } catch (err) {
        return Err(err);
    }
}

/** A changed telemetry flag reaches the installation with its next license. */
export async function updateInstallation(
    db: RegistryDb,
    {
        id,
        name,
        mode,
        stage,
        telemetry,
        alerts
    }: {
        id: number;
        name?: string;
        mode?: DBSelfHostingInstallation['mode'];
        stage?: DBSelfHostingInstallation['stage'];
        telemetry?: boolean;
        alerts?: DBSelfHostingInstallation['alerts'];
    }
): Promise<Result<DBSelfHostingInstallation>> {
    try {
        const [row] = await installations(db)
            .where({ id, deleted_at: null })
            .update({
                updated_at: new Date(),
                ...(name && { name }),
                ...(mode && { mode }),
                ...(stage && { stage }),
                ...(telemetry !== undefined && { telemetry }),
                ...(alerts && { alerts })
            })
            .returning('*');
        return row ? Ok(row) : Err(new Error(`no live installation ${id}`));
    } catch (err) {
        return Err(err);
    }
}

export async function deleteInstallation(db: RegistryDb, { id }: { id: number }): Promise<Result<DBSelfHostingInstallation>> {
    try {
        return await db.knex.transaction(async (trx) => {
            const inTrx = { ...db, knex: trx };
            const now = new Date();
            const [row] = await installations(inTrx).where({ id, deleted_at: null }).update({ deleted_at: now, updated_at: now }).returning('*');
            if (!row) {
                return Err(new Error(`no live installation ${id}`));
            }
            await table<DBSelfHostingInstallationLicense>(inTrx, INSTALLATION_LICENSES_TABLE)
                .where({ installation_id: id, active: true })
                .update({ active: false });
            await table<DBSelfHostingInstallationKey>(inTrx, INSTALLATION_KEYS_TABLE)
                .where({ installation_id: id, deleted_at: null })
                .update({ deleted_at: now });
            return Ok(row);
        });
    } catch (err) {
        return Err(err);
    }
}

export async function getInstallation(db: RegistryDb, { id }: { id: number }): Promise<Result<DBSelfHostingInstallation | null>> {
    try {
        return Ok((await installations(db).where({ id, deleted_at: null }).first()) ?? null);
    } catch (err) {
        return Err(err);
    }
}
