/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_environment_variables" DROP CONSTRAINT "_nango_environment_variables_environment_id_foreign",
        ADD CONSTRAINT "_nango_environment_variables_environment_id_foreign" 
        FOREIGN KEY ("environment_id") 
        REFERENCES "_nango_environments" ("id") 
        ON DELETE CASCADE`);

    await knex.raw(`ALTER TABLE "_nango_configs" DROP CONSTRAINT "_nango_configs_environment_id_foreign",
        ADD CONSTRAINT "_nango_configs_environment_id_foreign" 
        FOREIGN KEY ("environment_id") 
        REFERENCES "_nango_environments" ("id") 
        ON DELETE CASCADE`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_environment_variables" DROP CONSTRAINT "_nango_environment_variables_environment_id_foreign",
        ADD CONSTRAINT "_nango_environment_variables_environment_id_foreign" 
        FOREIGN KEY ("environment_id") 
        REFERENCES "_nango_environments" ("id")`);

    // await knex.raw(`ALTER TABLE "_nango_configs" DROP CONSTRAINT "_nango_configs_environment_id_foreign",
    //     ADD CONSTRAINT "_nango_configs_environment_id_foreign"
    //     FOREIGN KEY ("environment_id")
    //     REFERENCES "_nango_environments" ("id")`);
};
