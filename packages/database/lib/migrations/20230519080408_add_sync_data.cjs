const tableName = '_nango_sync_data_records';

exports.up = function (knex) {
    return knex.schema.createTable(tableName, function (table) {
        table.uuid('id').notNullable();
        table.string('external_id').notNullable();
        table.jsonb('json');
        table.string('data_hash').notNullable();
        table.integer('nango_connection_id').unsigned().notNullable().index();
        table.string('model').notNullable();
        table.timestamps(true, true);

        table.foreign('nango_connection_id').references('id').inTable('_nango_connections').onDelete('CASCADE');

        table.unique(['nango_connection_id', 'external_id']);

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
