const tableName = '_nango_sync_data_records_deletes';
const JOBS_TABLE = '_nango_sync_jobs';
const SYNC_TABLE = '_nango_syncs';

exports.up = function (knex) {
    return knex.schema.createTable(tableName, function (table) {
        table.uuid('id').notNullable();
        table.string('external_id').notNullable().index();
        table.jsonb('json');
        table.string('data_hash').notNullable().index();
        table.foreign('nango_connection_id').references('id').inTable('_nango_connections').onDelete('CASCADE');
        table.integer('nango_connection_id').unsigned().notNullable().index();
        table.string('model').notNullable();
        table.timestamps(true, true);
        table.uuid('sync_id').references('id').inTable(SYNC_TABLE).onDelete('CASCADE');
        table.integer('sync_job_id').references('id').inTable(JOBS_TABLE).onDelete('CASCADE').index();
        table.boolean('external_is_deleted').defaultTo(false).index();
        table.dateTime('external_deleted_at').index();

        table.unique(['nango_connection_id', 'external_id', 'model']);
        table.index(['nango_connection_id', 'model']);
        table.index('created_at');
        table.index('updated_at');

        knex.raw(
            `
          CREATE OR REPLACE FUNCTION update_${tableName}_updated_at()
          RETURNS TRIGGER AS $$
          BEGIN
            IF OLD.data_hash IS DISTINCT FROM NEW.data_hash THEN
             NEW.updated_at = NOW();
            END IF;

            RETURN NEW;
            END;
          $$ LANGUAGE plpgsql;
        `
        ).then(function () {
            return knex.raw(`
            CREATE TRIGGER ${tableName}_update_updated_at
            BEFORE UPDATE ON ${tableName}
            FOR EACH ROW
            EXECUTE FUNCTION update_${tableName}_updated_at();
          `);
        });
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable(tableName);
};
