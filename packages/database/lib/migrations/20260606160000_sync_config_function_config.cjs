exports.config = { transaction: false };

exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_sync_configs ADD COLUMN IF NOT EXISTS function_config JSONB`);
};

exports.down = async function () {};
