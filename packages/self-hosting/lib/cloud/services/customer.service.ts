import { Err, Ok } from '@nangohq/utils';

import { CUSTOMERS_TABLE, INSTALLATIONS_TABLE } from '../db/schema.js';
import { inserted, table } from './db.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingCustomer, DBSelfHostingInstallation } from '@nangohq/types';
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
    const customer = await getCustomerByName(db, { name });
    if (customer.isErr()) {
        return Err(customer.error);
    }
    if (!customer.value) {
        return Err(new Error(`no live customer ${name}`));
    }
    try {
        const live = await table<DBSelfHostingInstallation>(db, INSTALLATIONS_TABLE)
            .where({ customer_id: customer.value.id, deleted_at: null })
            .count<{ count: string }[]>('id')
            .first();
        if (Number(live?.count) > 0) {
            return Err(new Error(`customer ${name} still has ${live?.count} live installations`));
        }
        const [row] = await customers(db).where({ id: customer.value.id, deleted_at: null }).update({ deleted_at: new Date() }).returning('*');
        return row ? Ok(row) : Err(new Error(`no live customer ${name}`));
    } catch (err) {
        return Err(err);
    }
}
