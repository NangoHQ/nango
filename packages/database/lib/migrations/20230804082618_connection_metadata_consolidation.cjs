/**
 * Connection metadata consolidation
 * @desc 1) merge metadata into connection_config
 *       2) move fieldMappings into metadata under a fieldMapping key
 */
const DB_TABLE = '_nango_connections';

exports.up = async function (knex) {
    const existingMetaData = await knex.select('id', 'metadata', 'connection_config').from(DB_TABLE).whereNotNull('metadata').andWhere('metadata', '!=', '{}');

    for (const record of existingMetaData) {
        const { id, metadata, connection_config } = record;
        const updatedConnectionConfig = { ...connection_config, ...metadata };

        await knex.update({ connection_config: updatedConnectionConfig, metadata: {} }).from(DB_TABLE).where({ id });
    }

    const existingFieldMappings = await knex
        .select('id', 'field_mappings')
        .from(DB_TABLE)
        .whereNotNull('field_mappings')
        .andWhere('field_mappings', '!=', '{}');

    for (const record of existingFieldMappings) {
        const { id, field_mappings } = record;
        const updatedFieldMappings = { fieldMapping: field_mappings };

        await knex.update({ metadata: updatedFieldMappings, field_mappings: {} }).from(DB_TABLE).where({ id });
    }

    return knex.schema.alterTable(DB_TABLE, function (table) {
        table.dropColumn('field_mappings');
    });
};

exports.down = async function (knex) {
    return knex.schema.alterTable(DB_TABLE, function (table) {
        table.jsonb('field_mappings').defaultTo('{}');
    });
};
