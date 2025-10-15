exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS proxy_max INTEGER,
        ADD COLUMN IF NOT EXISTS function_executions_max INTEGER,
        ADD COLUMN IF NOT EXISTS function_compute_gbms_max INTEGER,
        ADD COLUMN IF NOT EXISTS records_max INTEGER,
        ADD COLUMN IF NOT EXISTS external_webhooks_max INTEGER,
        ADD COLUMN IF NOT EXISTS function_logs_max INTEGER
    `);

    // set default values for existing free plans
    await knex.raw(`
        UPDATE plans
        SET
            proxy_max = 100000,
            function_executions_max = 100000,
            function_compute_gbms_max = 50000000,
            records_max = 100000,
            external_webhooks_max = 100000,
            function_logs_max = 100000
        WHERE name = 'free'
    `);
};

exports.down = async function () {};
