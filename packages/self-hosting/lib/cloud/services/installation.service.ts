import { Err, Ok } from '@nangohq/utils';

import { INSTALLATION_KEYS_TABLE, INSTALLATION_LICENSES_TABLE, INSTALLATIONS_TABLE } from '../db/schema.js';
import { inserted, isUniqueViolation, orMissing, table } from './db.js';
import { listInstallationKeys } from './installation-key.service.js';
import { getActiveLicense } from './installation-license.service.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallation, DBSelfHostingInstallationKey, DBSelfHostingInstallationLicense } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const installations = (db: RegistryDb) => table<DBSelfHostingInstallation>(db, INSTALLATIONS_TABLE);

export interface DeleteInstallationPreview {
    installation: { uuid: string; name: string };
    keys: string[];
    activeLicense: Date | null;
}

function alertsAllowed(mode: DBSelfHostingInstallation['mode'], alerts: DBSelfHostingInstallation['alerts']): Result<void> {
    return mode === 'self_managed' && alerts !== 'off'
        ? Err(new Error('a self-managed installation is not in our Datadog, alerts must be off'))
        : Ok(undefined);
}

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
    const allowed = alertsAllowed(mode, alerts ?? 'off');
    if (allowed.isErr()) {
        return Err(allowed.error);
    }
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

export async function requireInstallation(
    db: RegistryDb,
    { uuid, includeDeleted = false }: { uuid: string; includeDeleted?: boolean }
): Promise<Result<DBSelfHostingInstallation>> {
    return orMissing(await getInstallationByUuid(db, { uuid, includeDeleted }), `no ${includeDeleted ? '' : 'live '}installation ${uuid}`);
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
    if ([name, mode, stage, telemetry, alerts].every((v) => v === undefined)) {
        return Err(new Error('nothing to update'));
    }
    try {
        return Ok(
            await db.knex.transaction(async (trx) => {
                const inTrx = { ...db, knex: trx };
                const [current] = await installations(inTrx)
                    .where({ id, deleted_at: null })
                    .forUpdate()
                    .select<Pick<DBSelfHostingInstallation, 'mode' | 'alerts'>[]>('mode', 'alerts');
                if (!current) {
                    throw new Error(`no live installation ${id}`);
                }
                alertsAllowed(mode ?? current.mode, alerts ?? current.alerts).unwrap();
                const [row] = await installations(inTrx)
                    .where({ id })
                    .update({
                        updated_at: new Date(),
                        ...(name && { name }),
                        ...(mode && { mode }),
                        ...(stage && { stage }),
                        ...(telemetry !== undefined && { telemetry }),
                        ...(alerts && { alerts })
                    })
                    .returning('*');
                if (!row) {
                    throw new Error(`no live installation ${id}`);
                }
                return row;
            })
        );
    } catch (err) {
        return Err(isUniqueViolation(err) ? new Error(`installation ${name} already exists for this customer`) : err);
    }
}

export async function deleteInstallationPreview(
    db: RegistryDb,
    { installation }: { installation: DBSelfHostingInstallation }
): Promise<Result<DeleteInstallationPreview>> {
    const keys = await listInstallationKeys(db, { installationId: installation.id });
    if (keys.isErr()) {
        return Err(keys.error);
    }
    const license = await getActiveLicense(db, { installationId: installation.id });
    if (license.isErr()) {
        return Err(license.error);
    }
    return Ok({
        installation: { uuid: installation.uuid, name: installation.name },
        keys: keys.value.map((k) => k.kid),
        activeLicense: license.value?.expires_at ?? null
    });
}

export async function deleteInstallation(db: RegistryDb, { id }: { id: number }): Promise<Result<DBSelfHostingInstallation>> {
    try {
        return Ok(
            await db.knex.transaction(async (trx) => {
                const inTrx = { ...db, knex: trx };
                const now = new Date();
                const [row] = await installations(inTrx).where({ id, deleted_at: null }).update({ deleted_at: now, updated_at: now }).returning('*');
                if (!row) {
                    throw new Error(`no live installation ${id}`);
                }
                await table<DBSelfHostingInstallationLicense>(inTrx, INSTALLATION_LICENSES_TABLE)
                    .where({ installation_id: id, active: true })
                    .update({ active: false });
                await table<DBSelfHostingInstallationKey>(inTrx, INSTALLATION_KEYS_TABLE)
                    .where({ installation_id: id, deleted_at: null })
                    .update({ deleted_at: now });
                return row;
            })
        );
    } catch (err) {
        return Err(err);
    }
}
