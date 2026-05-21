import db from '@nangohq/database';
import { Err, Ok, getLogger } from '@nangohq/utils';

import { decryptApiSecret } from './encryption.js';
import { buildSandboxApiKeyScopes, decryptSandboxSigningSecret, parseSandboxApiKeyToken, verifySandboxApiKeyToken } from './sandbox-api-key.service.js';

import type { DBAPISecret, DBEnvironment, DBPlan, DBTeam, Result } from '@nangohq/types';

const logger = getLogger('SandboxAccountContext');

export interface SandboxAccountContext {
    account: DBTeam;
    environment: DBEnvironment;
    secret: DBAPISecret;
    plan: DBPlan | null;
    auth: {
        source: 'sandbox_token';
        scopes: string[];
        apiKeyId: number;
        purpose: 'dryrun' | 'deploy';
        dryrunId?: string;
    };
}

export async function getAccountContextBySandboxApiKey(sandboxApiKey: string): Promise<Result<SandboxAccountContext | null>> {
    try {
        const parsed = parseSandboxApiKeyToken(sandboxApiKey);
        if (!parsed) {
            return Ok(null);
        }

        const {
            rows: [row]
        } = await db.knex.raw<{
            rows: {
                account: DBTeam;
                environment: DBEnvironment;
                plan: DBPlan | null;
                default_secret: DBAPISecret;
                pending_secret: DBAPISecret | null;
                auth_scopes: string[] | null;
                auth_api_key_id: number;
                sandbox_signing_secret: string | null;
                sandbox_signing_secret_iv: string | null;
                sandbox_signing_secret_tag: string | null;
            }[];
        }>(
            `
                WITH matched_customer_key AS (
                    SELECT
                        ck.id,
                        ckr.entity_id AS environment_id,
                        ck.scopes,
                        ck.sandbox_signing_secret,
                        ck.sandbox_signing_secret_iv,
                        ck.sandbox_signing_secret_tag
                    FROM customer_keys ck
                    JOIN customer_keys_relations ckr ON ckr.customer_key_id = ck.id
                    WHERE ck.id = ?
                      AND ck.key_type = 'api'
                      AND ck.deleted_at IS NULL
                      AND ckr.entity_type = 'environment'
                    LIMIT 1
                )
                SELECT
                    row_to_json(_nango_environments.*) AS environment,
                    row_to_json(_nango_accounts.*) AS account,
                    row_to_json(plans.*) AS plan,
                    row_to_json(default_secret.*) AS default_secret,
                    row_to_json(pending_secret.*) AS pending_secret,
                    matched_customer_key.scopes AS auth_scopes,
                    matched_customer_key.id AS auth_api_key_id,
                    matched_customer_key.sandbox_signing_secret,
                    matched_customer_key.sandbox_signing_secret_iv,
                    matched_customer_key.sandbox_signing_secret_tag
                FROM matched_customer_key
                JOIN _nango_environments ON _nango_environments.id = matched_customer_key.environment_id
                JOIN _nango_accounts ON _nango_accounts.id = _nango_environments.account_id
                JOIN api_secrets AS default_secret
                    ON default_secret.environment_id = _nango_environments.id
                   AND default_secret.is_default = true
                LEFT JOIN api_secrets AS pending_secret
                    ON pending_secret.environment_id = _nango_environments.id
                   AND pending_secret.is_default = false
                LEFT JOIN plans ON plans.account_id = _nango_accounts.id
                WHERE _nango_environments.deleted = false
                LIMIT 1;
            `,
            [parsed.parentApiKeyId]
        );
        if (!row) {
            return Ok(null);
        }

        const signingSecret = decryptSandboxSigningSecret(row);
        if (!signingSecret) {
            return Ok(null);
        }

        const verified = verifySandboxApiKeyToken({ token: sandboxApiKey, signingSecret });
        if (!verified) {
            return Ok(null);
        }

        try {
            // The JWT kid header is untrusted until the signature checks out, so this stays after verification.
            await db
                .knex('customer_keys')
                .where('id', row.auth_api_key_id)
                .where(function () {
                    void this.whereNull('last_used_at').orWhere('last_used_at', '<', db.knex.raw(`NOW() - INTERVAL '1 minute'`));
                })
                .update({ last_used_at: db.knex.fn.now() });
        } catch (err) {
            logger.warning('Failed to update sandbox API key last_used_at', { err, customerKeyId: row.auth_api_key_id });
        }

        const defaultSecret = decryptApiSecret(row.default_secret);
        const pendingKey = row.pending_secret ? decryptApiSecret(row.pending_secret) : null;

        return Ok({
            account: {
                ...row.account,
                created_at: new Date(row.account.created_at),
                updated_at: new Date(row.account.updated_at)
            },
            environment: {
                ...row.environment,
                secret_key: defaultSecret.secret,
                pending_secret_key: pendingKey?.secret || null,
                created_at: new Date(row.environment.created_at),
                updated_at: new Date(row.environment.updated_at),
                deleted_at: row.environment.deleted_at ? new Date(row.environment.deleted_at) : row.environment.deleted_at
            },
            plan: row.plan
                ? {
                      ...row.plan,
                      created_at: new Date(row.plan.created_at),
                      updated_at: new Date(row.plan.updated_at),
                      trial_start_at: row.plan.trial_start_at ? new Date(row.plan.trial_start_at) : row.plan.trial_start_at,
                      trial_end_at: row.plan.trial_end_at ? new Date(row.plan.trial_end_at) : row.plan.trial_end_at,
                      trial_end_notified_at: row.plan.trial_end_notified_at ? new Date(row.plan.trial_end_notified_at) : row.plan.trial_end_notified_at,
                      orb_subscribed_at: row.plan.orb_subscribed_at ? new Date(row.plan.orb_subscribed_at) : row.plan.orb_subscribed_at,
                      orb_future_plan_at: row.plan.orb_future_plan_at ? new Date(row.plan.orb_future_plan_at) : row.plan.orb_future_plan_at
                  }
                : null,
            secret: defaultSecret,
            auth: {
                source: 'sandbox_token',
                scopes: buildSandboxApiKeyScopes(row.auth_scopes),
                apiKeyId: row.auth_api_key_id,
                purpose: verified.purpose,
                ...(verified.dryrun_id ? { dryrunId: verified.dryrun_id } : {})
            }
        });
    } catch (err) {
        return Err(err);
    }
}
