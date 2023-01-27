import knex from 'knex';
import type { Knex } from 'knex';
import { config } from './config.js';

class KnexDatabase {
    knex: Knex;

    constructor() {
        this.knex = knex(config.development);
    }

    async migrate(directory: string): Promise<any> {
        return this.knex.migrate.latest({ directory: directory, tableName: '_nango_auth_migrations', schemaName: this.schema() });
    }

    schema() {
        return 'nango';
    }
}

export default new KnexDatabase();
