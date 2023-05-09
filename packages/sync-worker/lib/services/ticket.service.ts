import type { Knex } from 'knex';
import db from '../db/database.js';
import type { TicketModel } from '../models/Ticket.js';

const schema = (): Knex.QueryBuilder => db.knex.withSchema(db.schema());

const TABLE = '_nango_unified_tickets';

async function create(model: TicketModel): Promise<boolean> {
    const trx = await db.knex.transaction();
    try {
        await schema().table(TABLE).transacting(trx).insert(model);
        await trx.commit();

        // TODO logging
        console.log('Created Model');
        return true;
    } catch (error) {
        await trx.rollback();
        console.error('Error creating model:', error);
        throw error;
    }
}

async function update(id: string, model: TicketModel): Promise<boolean> {
    const trx = await db.knex.transaction();
    try {
        await schema().table(TABLE).transacting(trx).where({ id }).update(model);
        await trx.commit();

        // TODO logging
        console.log('Updated model:');
        return true;
    } catch (error) {
        await trx.rollback();
        console.error('Error creating model:', error);
        throw error;
    }
}

export async function createOrUpdate(model: TicketModel) {
    const rows = await schema().select('id', 'updated_at').from<TicketModel>(TABLE).where({ external_id: model.external_id });

    if (rows.length === 0) {
        return create(model);
    }

    const [row] = rows;

    if (new Date(row.external_updated_at) < new Date(model.external_updated_at)) {
        delete model.id;
        return update(row.id, model);
    }

    return true;
}
