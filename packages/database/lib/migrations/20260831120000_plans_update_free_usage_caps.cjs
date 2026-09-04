exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex('plans').where('name', 'free').update({
        connections_max: 10,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        function_duration_seconds_max: 36_000,
        webhook_forwards_max: null,
        function_logs_max: null
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
