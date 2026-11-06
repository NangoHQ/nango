import { Err, Ok } from '@nangohq/utils';

import { CUSTOMERS_TABLE } from '../db/schema.js';
import { inserted, isUniqueViolation, orMissing, table } from './db.js';
import { deleteInstallation, deleteInstallationPreview, listInstallations } from './installation.service.js';

import type { RegistryDb } from './db.js';
import type { DeleteInstallationPreview } from './installation.service.js';
import type { DBSelfHostingCustomer } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const customers = (db: RegistryDb) => table<DBSelfHostingCustomer>(db, CUSTOMERS_TABLE);

export async function createCustomer(db: RegistryDb, { name }: { name: string }): Promise<Result<DBSelfHostingCustomer>> {
    try {
        return Ok(inserted(await customers(db).insert({ name }).returning('*')));
    } catch (err) {
        return Err(isUniqueViolation(err) ? new Error(`customer ${name} already exists`) : err);
    }
}

export async function getCustomerByName(db: RegistryDb, { name }: { name: string }): Promise<Result<DBSelfHostingCustomer | null>> {
    try {
        return Ok((await customers(db).where({ name, deleted_at: null }).first()) ?? null);
    } catch (err) {
        return Err(err);
    }
}

export async function requireCustomer(db: RegistryDb, { name }: { name: string }): Promise<Result<DBSelfHostingCustomer>> {
    return orMissing(await getCustomerByName(db, { name }), `no live customer ${name}`);
}

export async function deleteCustomerPreview(
    db: RegistryDb,
    { customer }: { customer: DBSelfHostingCustomer }
): Promise<Result<{ customer: string; installations: DeleteInstallationPreview[] }>> {
    const rows = await listInstallations(db, { customerId: customer.id });
    if (rows.isErr()) {
        return Err(rows.error);
    }
    const installations: DeleteInstallationPreview[] = [];
    for (const installation of rows.value) {
        const preview = await deleteInstallationPreview(db, { installation });
        if (preview.isErr()) {
            return Err(preview.error);
        }
        installations.push(preview.value);
    }
    return Ok({ customer: customer.name, installations });
}

export async function deleteCustomer(db: RegistryDb, { name }: { name: string }): Promise<Result<DBSelfHostingCustomer>> {
    try {
        return Ok(
            await db.knex.transaction(async (trx) => {
                const inTrx = { ...db, knex: trx };
                const customer = (await requireCustomer(inTrx, { name })).unwrap();
                for (const installation of (await listInstallations(inTrx, { customerId: customer.id })).unwrap()) {
                    (await deleteInstallation(inTrx, { id: installation.id })).unwrap();
                }
                const now = new Date();
                const [row] = await customers(inTrx).where({ id: customer.id, deleted_at: null }).update({ deleted_at: now, updated_at: now }).returning('*');
                if (!row) {
                    throw new Error(`no live customer ${name}`);
                }
                return row;
            })
        );
    } catch (err) {
        return Err(err);
    }
}

export async function listCustomers(db: RegistryDb, { includeDeleted = false }: { includeDeleted?: boolean } = {}): Promise<Result<DBSelfHostingCustomer[]>> {
    try {
        return Ok(
            await customers(db)
                .where(includeDeleted ? {} : { deleted_at: null })
                .orderBy('id')
        );
    } catch (err) {
        return Err(err);
    }
}
