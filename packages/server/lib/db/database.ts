import knex from 'knex';
import type { Knex } from 'knex';
import { config } from './config.js';

class KnexDatabase {
    knex: Knex;

    constructor() {
        this.knex = knex(config.development);
    }

    async migrate(directory: string): Promise<any> {
        return this.knex.migrate.latest({ directory: directory });
    }

    schema() {
        return process.env['PIZZLY_DB_SCHEMA'] || 'pizzly';
    }
}

export default new KnexDatabase();
