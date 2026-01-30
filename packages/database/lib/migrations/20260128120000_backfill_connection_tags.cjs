exports.config = { transaction: false };

const { buildConnectionTagsBackfillUpdateSql } = require('../migration-helpers/backfillConnectionTagsSql.cjs');

exports.up = async function (knex) {
    await knex.raw(buildConnectionTagsBackfillUpdateSql());
};

exports.down = async function () {};
