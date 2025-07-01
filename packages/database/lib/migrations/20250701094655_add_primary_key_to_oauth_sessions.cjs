/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_oauth_sessions ADD CONSTRAINT pk_nango_oauth_sessions_id PRIMARY KEY USING INDEX _nango_oauth_sessions_id_unique;`);
    await knex.raw('ALTER TABLE _nango_db_config ADD PRIMARY KEY (encryption_key_hash);');
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {
    //
};
