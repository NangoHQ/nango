const RECORDS_TABLE = '_nango_sync_data_records';
exports.up = async function (knex) {
    await knex.transaction((trx) => {
        return trx
            .raw(
                `
            CREATE OR REPLACE FUNCTION ${RECORDS_TABLE}_reset_created_at()
            RETURNS TRIGGER AS $$
            BEGIN
                IF OLD.external_deleted_at IS NOT NULL AND NEW.external_deleted_at IS NULL THEN
                    NEW.created_at = NOW();
                    NEW.updated_at = NOW();
                    NEW.external_is_deleted = FALSE;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            `
            )
            .then(function () {
                return trx.raw(`
                    CREATE TRIGGER ${RECORDS_TABLE}_reset_created_at_trigger
                    BEFORE UPDATE ON ${RECORDS_TABLE}
                    FOR EACH ROW
                    EXECUTE FUNCTION ${RECORDS_TABLE}_reset_created_at();
            `);
            });
    });
};

exports.down = async function (knex) {
    await knex.transaction((trx) => {
        return trx.raw(`DROP TRIGGER IF EXISTS ${RECORDS_TABLE}_reset_created_at_trigger ON ${RECORDS_TABLE};`).then(function () {
            return trx.raw(`DROP FUNCTION IF EXISTS ${RECORDS_TABLE}_reset_created_at();`);
        });
    });
};
