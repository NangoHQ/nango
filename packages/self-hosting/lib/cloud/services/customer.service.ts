import { Err, Ok } from '@nangohq/utils';

import { CUSTOMERS_TABLE } from '../db/schema.js';
import { inserted, table } from './db.js';

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
