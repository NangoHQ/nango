// Account 0 is a real, seeded account (migration 20230208124526) and the one every no-auth request
// runs as, so the accepted range has to include it.
//
// ClickHouse can't alter a constraint in place, hence the drop and re-add.
export const sql = [
    `ALTER TABLE {database:Identifier}.audit_trail_events DROP CONSTRAINT IF EXISTS account_id_valid`,
    `
    ALTER TABLE {database:Identifier}.audit_trail_events
        ADD CONSTRAINT IF NOT EXISTS account_id_valid CHECK JSONType(event, 'accountId') = 'Int64' AND account_id >= 0
    `
];
