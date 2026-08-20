exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS spend_alert_notifications (
            id                 SERIAL PRIMARY KEY,
            account_id         INTEGER NOT NULL REFERENCES _nango_accounts(id) ON DELETE CASCADE,
            threshold_in_cents INTEGER NOT NULL,
            timeframe_start    TIMESTAMPTZ NOT NULL,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            notified_at        TIMESTAMPTZ,
            claim_token        UUID NOT NULL
        );

        -- The de-dup rule itself: one email per threshold per billing period. Orb's cost_exceeded
        -- webhook is at-least-once and retries on a non-2xx, so a row is claimed before the send
        -- and the unique violation is what stops a redelivery emailing the customer twice.
        -- A row with a null notified_at is a claim still in flight; see the lease in
        -- claimSpendAlertNotification for how an abandoned one is taken over. claim_token is
        -- reissued on every takeover, so a worker that outlived its lease can't finalise the row
        -- that replaced it.
        CREATE UNIQUE INDEX IF NOT EXISTS idx_spend_alert_notifications_unique
            ON spend_alert_notifications (account_id, threshold_in_cents, timeframe_start);
    `);
};

exports.down = async function (knex) {
    await knex.raw(`DROP TABLE IF EXISTS spend_alert_notifications;`);
};
