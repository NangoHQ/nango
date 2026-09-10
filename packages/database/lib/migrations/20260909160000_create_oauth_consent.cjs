exports.config = { transaction: true };

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE TABLE oauth_product_grants (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            provider_grant_hash BYTEA NOT NULL UNIQUE,
            user_id INTEGER NOT NULL REFERENCES _nango_users(id) ON DELETE CASCADE,
            account_id INTEGER NOT NULL REFERENCES _nango_accounts(id) ON DELETE CASCADE,
            client_id TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            revoked_at TIMESTAMPTZ
        );
        CREATE INDEX oauth_product_grants_user_idx ON oauth_product_grants(user_id, status);
        CREATE INDEX oauth_product_grants_account_idx ON oauth_product_grants(account_id);
        CREATE INDEX oauth_product_grants_pending_idx ON oauth_product_grants(created_at) WHERE status = 'pending';
        CREATE TABLE oauth_product_grant_resources (
            grant_id UUID NOT NULL REFERENCES oauth_product_grants(id) ON DELETE CASCADE,
            resource TEXT NOT NULL,
            scopes TEXT[] NOT NULL,
            PRIMARY KEY(grant_id, resource)
        );
        CREATE TABLE oauth_consent_decisions (
            interaction_hash BYTEA PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES _nango_users(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX oauth_consent_decisions_expiry_idx ON oauth_consent_decisions(expires_at);
        CREATE INDEX oauth_consent_decisions_user_idx ON oauth_consent_decisions(user_id);
    `);
};

exports.down = async function () {
    // Preserve grants and revocation state during a code rollback, as with provider artifacts.
};
