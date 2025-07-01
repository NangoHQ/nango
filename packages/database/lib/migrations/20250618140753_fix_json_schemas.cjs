const { legacySyncModelsToJsonSchema, nangoModelsToJsonSchema } = require('@nangohq/utils');

exports.up = async function (knex) {
    const publicSyncConfigs = await knex.select('*').from('_nango_sync_configs').where({
        is_public: true,
        deleted: false
    });

    for (const syncConfig of publicSyncConfigs) {
        /**
         * Set to null if there are no models.
         */
        if (
            syncConfig.model_schema === null ||
            Object.keys(syncConfig.model_schema).length === 0 ||
            (Array.isArray(syncConfig.model_schema) && syncConfig.model_schema.length === 0)
        ) {
            await knex.update({ models_json_schema: null }).from('_nango_sync_configs').where({ id: syncConfig.id });
            continue;
        }

        const nangoModels = Array.isArray(syncConfig.model_schema) ? syncConfig.model_schema : [syncConfig.model_schema];
        const newJsonSchema = isLegacyModelSchema(nangoModels) ? legacySyncModelsToJsonSchema(nangoModels) : nangoModelsToJsonSchema(nangoModels);

        // Add a marker to the JSON schema to indicate that it was migrated.
        // In case we ever need to fix something about this migration.
        newJsonSchema['$nango_migration'] = '20250618140753';

        await knex
            .update({
                models_json_schema: newJsonSchema
            })
            .from('_nango_sync_configs')
            .where({
                id: syncConfig.id
            });
    }
};

/**
 * Legacy schema has `type`. New schema has `value`.
 */
function isLegacyModelSchema(modelSchemas) {
    return modelSchemas.length > 0 && modelSchemas[0]?.fields?.length > 0 && Object.keys(modelSchemas[0].fields[0]).includes('type');
}

exports.down = function () {};
