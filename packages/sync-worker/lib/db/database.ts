import knex from 'knex';
import type { Knex } from 'knex';
import { dbConfig } from './db.config.js';

class KnexDatabase {
    knex: Knex;

    constructor() {
        const config = dbConfig.development;
        this.knex = knex(config);
    }

    async migrate(directory: string): Promise<any> {
        return this.knex.migrate.latest({ directory: directory, tableName: '_nango_unified_migrations', schemaName: this.schema() });
    }

    schema() {
        return 'nango';
    }
}

export default new KnexDatabase();
