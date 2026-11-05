import { Err, Ok } from '@nangohq/utils';

import { CUSTOMERS_TABLE } from '../db/schema.js';
import { inserted, table } from './db.js';
import { deleteInstallation, listInstallations } from './installation.service.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingCustomer } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const customers = (db: RegistryDb) => table<DBSelfHostingCustomer>(db, CUSTOMERS_TABLE);

export async function createCustomer(db: RegistryDb, { name }: { name: string }): Promise<Result<DBSelfHostingCustomer>> {
    try {
        return Ok(inserted(await customers(db).insert({ name }).returning('*')));
    } catch (err) {
        return Err(err);
    }
}

export async function getCustomerByName(db: RegistryDb, { name }: { name: string }): Promise<Result<DBSelfHostingCustomer | null>> {
    try {
        return Ok((await customers(db).where({ name, deleted_at: null }).first()) ?? null);
    } catch (err) {
        return Err(err);
    }
}

export async function deleteCustomer(db: RegistryDb, { name }: { name: string }): Promise<Result<DBSelfHostingCustomer>> {
    try {
        return await db.knex.transaction(async (trx) => {
            const inTrx = { ...db, knex: trx };
            const customer = (await getCustomerByName(inTrx, { name })).unwrap();
            if (!customer) {
                return Err(new Error(`no live customer ${name}`));
            }
            for (const installation of (await listInstallations(inTrx, { customerId: customer.id })).unwrap()) {
                (await deleteInstallation(inTrx, { id: installation.id })).unwrap();
            }
            const [row] = await customers(inTrx).where({ id: customer.id }).update({ deleted_at: new Date() }).returning('*');
            return row ? Ok(row) : Err(new Error(`no live customer ${name}`));
        });
    } catch (err) {
        return Err(err);
    }
}
