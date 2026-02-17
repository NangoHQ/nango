exports.config = { transaction: false };

const { buildConnectionTagsBackfillUpdateSql } = require('../migration-helpers/backfillConnectionTagsSql.cjs');

exports.up = async function (knex) {
    const result = await knex.raw(buildConnectionTagsBackfillUpdateSql());
    const summary = result?.rows?.[0];
    if (summary) {
        console.log('[connection tags backfill] summary', summary);
    }
};

exports.down = async function () {};
