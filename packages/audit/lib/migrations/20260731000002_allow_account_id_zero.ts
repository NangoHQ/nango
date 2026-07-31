// Account 0 is a real account, not a sentinel: migration 20230208124526 inserts `_nango_accounts
// {id: 0, email: 'self-hosted'}` as the FK target for `_nango_configs.account_id`'s default, and
// `noAuth()` resolves every request to the user it owns whenever auth is disabled. So the original
// `account_id > 0` — written on the assumption that Postgres serials start at 1 — rejects every
// event emitted by a no-auth deployment.
//
// The rest of the guard is what actually catches a bad blob and is unchanged: JSONExtractInt yields
// 0 for a missing or malformed accountId, and JSONType tells those apart from a real 0.
//
// ClickHouse has no in-place constraint change, so this is a drop and re-add.
export const sql = [
    `ALTER TABLE {database:Identifier}.audit_trail_events DROP CONSTRAINT IF EXISTS account_id_valid`,
    `
    ALTER TABLE {database:Identifier}.audit_trail_events
        ADD CONSTRAINT IF NOT EXISTS account_id_valid CHECK JSONType(event, 'accountId') = 'Int64' AND account_id >= 0
    `
];
