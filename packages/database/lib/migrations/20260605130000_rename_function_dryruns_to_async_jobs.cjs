exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.renameTable('function_dryruns', 'function_async_jobs');

    await knex.schema.alterTable('function_async_jobs', (table) => {
        table.text('job_type').notNullable().defaultTo('dryrun');
    });

    await knex.schema.raw(`
        ALTER TABLE function_async_jobs
            ADD CONSTRAINT function_async_jobs_job_type_check
            CHECK (job_type IN ('dryrun', 'deployment'));

        ALTER INDEX function_dryruns_environment_id_id_idx
            RENAME TO function_async_jobs_environment_id_id_idx;

        ALTER INDEX function_dryruns_created_at_idx
            RENAME TO function_async_jobs_created_at_idx;

        ALTER INDEX function_dryruns_running_timeout_idx
            RENAME TO function_async_jobs_running_timeout_idx;

        ALTER INDEX function_dryruns_waiting_created_at_idx
            RENAME TO function_async_jobs_waiting_created_at_idx;
    `);

    await knex.schema.raw(`
        CREATE INDEX function_async_jobs_environment_id_job_type_id_idx
            ON function_async_jobs (environment_id, job_type, id);
    `);
};

exports.down = async function () {};
